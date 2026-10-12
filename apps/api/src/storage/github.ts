import { type AuditEntry, type LedgerState, type SnapshotMeta, migrateState } from "@family-ledger/shared";
import type { RecordCodec } from "../crypto";
import {
  type AuditHead,
  type CommitInput,
  type LedgerStore,
  type LoadedLedger,
  StoreConflictError,
  StoreUnavailableError,
  monthOf,
} from "./types";

/**
 * Stores encrypted ledger files in a PRIVATE GitHub repository using the Git
 * Data API, so each change is one atomic commit:
 *
 *   ledger/state.json.enc          the whole ledger (accounts, plans, notes…)
 *   audit/head.json.enc            {seq, hash, months}
 *   audit/YYYY-MM.json.enc         audit entries for that month
 *   snapshots/index.json.enc       snapshot list
 *   snapshots/<id>.json.enc        a full ledger copy
 *   FORMAT.md                      plaintext description (no secrets)
 *
 * Concurrency: a commit's parent is the version that was read. Updating the
 * branch ref with force=false fails if anyone else committed in between, and we
 * surface StoreConflictError — never overwrite.
 *
 * Every file except FORMAT.md is an AES-256-GCM envelope (see crypto.ts).
 * Git keeps every historical ciphertext forever; see docs/SECURITY.md.
 */

export interface GitHubStoreOptions {
  owner: string;
  repo: string;
  branch: string;
  token: () => Promise<string>;
  codec: RecordCodec;
  fetch?: typeof fetch;
  apiBase?: string;
}

const PATHS = {
  state: "ledger/state.json.enc",
  auditHead: "audit/head.json.enc",
  auditMonth: (m: string) => `audit/${m}.json.enc`,
  snapshotIndex: "snapshots/index.json.enc",
  snapshot: (id: string) => `snapshots/${id}.json.enc`,
  format: "FORMAT.md",
};

const FORMAT_DOC = `# Family Ledger private data

Every \`.enc\` file is an AES-256-GCM encryption envelope written by the Family
Ledger API. Files cannot be read without the server-side encryption key, which
is NOT stored in this repository. Do not edit these files by hand: the audit
log is hash-chained and edits will be detected.

See DEPLOYMENT.md in the application repository for backup and restore.
`;

export class GitHubLedgerStore implements LedgerStore {
  private fetchImpl: typeof fetch;
  private apiBase: string;
  /** Per-isolate cache of decrypted files keyed by commit SHA + path. */
  private cache = new Map<string, unknown>();
  private cacheCommit: string | null = null;

  constructor(private opts: GitHubStoreOptions) {
    this.fetchImpl = opts.fetch ?? fetch.bind(globalThis);
    this.apiBase = opts.apiBase ?? "https://api.github.com";
    if (!/^[A-Za-z0-9_.-]+$/.test(opts.owner) || !/^[A-Za-z0-9_.-]+$/.test(opts.repo)) {
      throw new Error("Invalid repository name");
    }
  }

  private async gh(
    method: string,
    path: string,
    body?: unknown,
    accept = "application/vnd.github+json",
  ): Promise<Response> {
    const token = await this.opts.token();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.apiBase}/repos/${this.opts.owner}/${this.opts.repo}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: accept,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "family-ledger-api",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new StoreUnavailableError("GitHub could not be reached");
    }
    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) {
      throw new StoreUnavailableError(`GitHub responded ${res.status}`);
    }
    return res;
  }

  private async headSha(): Promise<string | null> {
    const res = await this.gh("GET", `/git/ref/heads/${encodeURIComponent(this.opts.branch)}`);
    if (res.status === 404 || res.status === 409) return null;
    if (!res.ok) throw new StoreUnavailableError(`Could not read branch (${res.status})`);
    const json = (await res.json()) as { object: { sha: string } };
    return json.object.sha;
  }

  private async readFile(commit: string, path: string): Promise<unknown | null> {
    if (this.cacheCommit !== commit) {
      this.cache.clear();
      this.cacheCommit = commit;
    }
    if (this.cache.has(path)) return structuredClone(this.cache.get(path));
    const res = await this.gh(
      "GET",
      `/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${commit}`,
      undefined,
      "application/vnd.github.raw+json",
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new StoreUnavailableError(`Could not read ${path} (${res.status})`);
    const value = await this.opts.codec.decode(path, await res.text());
    this.cache.set(path, value);
    return structuredClone(value);
  }

  async load(): Promise<LoadedLedger> {
    const sha = await this.headSha();
    if (!sha) {
      throw new StoreUnavailableError(
        "The private data repository has no commits. Initialise it with a README first (see DEPLOYMENT.md).",
      );
    }
    const raw = await this.readFile(sha, PATHS.state);
    const head = (await this.readFile(sha, PATHS.auditHead)) as AuditHead | null;
    return { state: raw ? migrateState(raw) : null, version: sha, auditHead: head };
  }

  async commit(input: CommitInput): Promise<{ version: string }> {
    const parent = input.expectedVersion;
    if (!parent) throw new StoreUnavailableError("Cannot commit to an uninitialised repository");

    const files: Array<{ path: string; content: string }> = [];
    if (input.state) files.push({ path: PATHS.state, content: await this.opts.codec.encode(PATHS.state, input.state) });

    if (input.audit.length) {
      const head = ((await this.readFile(parent, PATHS.auditHead)) as AuditHead | null) ?? {
        seq: 0,
        hash: "",
        months: [],
      };
      const byMonth = new Map<string, AuditEntry[]>();
      for (const e of input.audit) byMonth.set(monthOf(e.at), [...(byMonth.get(monthOf(e.at)) ?? []), e]);
      for (const [month, entries] of byMonth) {
        const existing = ((await this.readFile(parent, PATHS.auditMonth(month))) as AuditEntry[] | null) ?? [];
        const path = PATHS.auditMonth(month);
        files.push({ path, content: await this.opts.codec.encode(path, [...existing, ...entries]) });
      }
      const last = input.audit[input.audit.length - 1]!;
      const nextHead: AuditHead = {
        seq: last.seq,
        hash: last.hash,
        months: [...new Set([...head.months, ...byMonth.keys()])].sort(),
      };
      files.push({ path: PATHS.auditHead, content: await this.opts.codec.encode(PATHS.auditHead, nextHead) });
    }

    if (input.snapshot) {
      const index = ((await this.readFile(parent, PATHS.snapshotIndex)) as SnapshotMeta[] | null) ?? [];
      const snapPath = PATHS.snapshot(input.snapshot.meta.id);
      files.push({ path: snapPath, content: await this.opts.codec.encode(snapPath, input.snapshot.state) });
      files.push({
        path: PATHS.snapshotIndex,
        content: await this.opts.codec.encode(PATHS.snapshotIndex, [...index, input.snapshot.meta]),
      });
    }

    // Identical content produces the identical blob, so this is a no-op after the first commit.
    files.push({ path: PATHS.format, content: FORMAT_DOC });

    const parentCommit = await this.gh("GET", `/git/commits/${parent}`);
    if (parentCommit.status === 404 || parentCommit.status === 422) throw new StoreConflictError();
    if (!parentCommit.ok) throw new StoreUnavailableError("Could not read parent commit");
    const baseTree = ((await parentCommit.json()) as { tree: { sha: string } }).tree.sha;

    const tree = [];
    for (const f of files) {
      const blobRes = await this.gh("POST", "/git/blobs", { content: f.content, encoding: "utf-8" });
      if (!blobRes.ok) throw new StoreUnavailableError("Could not write blob");
      const blob = (await blobRes.json()) as { sha: string };
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const treeRes = await this.gh("POST", "/git/trees", { base_tree: baseTree, tree });
    if (!treeRes.ok) throw new StoreUnavailableError("Could not write tree");
    const treeSha = ((await treeRes.json()) as { sha: string }).sha;

    const commitRes = await this.gh("POST", "/git/commits", {
      message: sanitizeMessage(input.message),
      tree: treeSha,
      parents: [parent],
    });
    if (!commitRes.ok) throw new StoreUnavailableError("Could not create commit");
    const newSha = ((await commitRes.json()) as { sha: string }).sha;

    const refRes = await this.gh("PATCH", `/git/refs/heads/${encodeURIComponent(this.opts.branch)}`, {
      sha: newSha,
      force: false,
    });
    if (refRes.status === 422 || refRes.status === 409) throw new StoreConflictError();
    if (!refRes.ok) throw new StoreUnavailableError("Could not update branch");
    return { version: newSha };
  }

  async readAudit(): Promise<AuditEntry[]> {
    const sha = await this.headSha();
    if (!sha) return [];
    const head = (await this.readFile(sha, PATHS.auditHead)) as AuditHead | null;
    if (!head) return [];
    const all: AuditEntry[] = [];
    for (const m of head.months) {
      all.push(...(((await this.readFile(sha, PATHS.auditMonth(m))) as AuditEntry[] | null) ?? []));
    }
    return all.sort((a, b) => a.seq - b.seq);
  }

  async listSnapshots(): Promise<SnapshotMeta[]> {
    const sha = await this.headSha();
    if (!sha) return [];
    const index = ((await this.readFile(sha, PATHS.snapshotIndex)) as SnapshotMeta[] | null) ?? [];
    return [...index].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async readSnapshot(id: string): Promise<LedgerState | null> {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return null;
    const sha = await this.headSha();
    if (!sha) return null;
    const raw = await this.readFile(sha, PATHS.snapshot(id));
    return raw ? migrateState(raw) : null;
  }
}

/** Commit messages are visible in plaintext: keep them generic, never include financial data. */
function sanitizeMessage(message: string): string {
  return message.replace(/[^\w .:-]/g, "").slice(0, 72) || "Ledger update";
}

export const GITHUB_PATHS = PATHS;
