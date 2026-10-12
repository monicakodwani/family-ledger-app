import type { AuditEntry } from "./schema";
import type { AuditDraft } from "./commands";

export const GENESIS_HASH = "0".repeat(64);

/** Deterministic JSON: object keys sorted, undefined dropped. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)));
    }
    return v;
  });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type AuditInput = Omit<AuditEntry, "id" | "seq" | "prevHash" | "hash">;

export function draftToInput(draft: AuditDraft, actorId: string, at: string): AuditInput {
  return {
    at,
    actorId,
    category: "record",
    action: draft.action,
    entityType: draft.entityType,
    entityId: draft.entityId,
    entityLabel: draft.entityLabel?.slice(0, 140),
    summary: draft.summary.slice(0, 400),
    changes: draft.changes,
    reason: draft.reason,
  };
}

/**
 * Append entries to a hash chain. Each entry's hash covers the previous hash,
 * so editing or deleting an earlier entry outside the app breaks verification.
 * This detects tampering; it does not prevent someone with repository write
 * access and the encryption key from rewriting the whole chain.
 */
export async function chainEntries(
  inputs: AuditInput[],
  last: { seq: number; hash: string } | null,
  newId: () => string,
): Promise<AuditEntry[]> {
  let prevHash = last?.hash ?? GENESIS_HASH;
  let seq = last?.seq ?? 0;
  const out: AuditEntry[] = [];
  for (const input of inputs) {
    seq += 1;
    const body = { ...input, id: newId(), seq, prevHash };
    const hash = await sha256Hex(prevHash + canonicalJson(body));
    out.push({ ...body, hash } as AuditEntry);
    prevHash = hash;
  }
  return out;
}

export async function verifyChain(
  entries: AuditEntry[],
  startHash = GENESIS_HASH,
): Promise<{ ok: boolean; brokenAtSeq?: number }> {
  let prev = startHash;
  for (const entry of [...entries].sort((a, b) => a.seq - b.seq)) {
    const { hash, ...body } = entry;
    if (body.prevHash !== prev) return { ok: false, brokenAtSeq: entry.seq };
    const expected = await sha256Hex(prev + canonicalJson(body));
    if (expected !== hash) return { ok: false, brokenAtSeq: entry.seq };
    prev = hash;
  }
  return { ok: true };
}

export function searchAudit(entries: AuditEntry[], query: string): AuditEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) =>
    [e.summary, e.entityLabel, e.action, e.reason].some((field) => field?.toLowerCase().includes(q)),
  );
}
