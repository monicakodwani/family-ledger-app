import {
  type Account,
  type AuditEntry,
  type Command,
  type LedgerState,
  type Note,
  type Plan,
  type SeedMemberConfig,
  type SnapshotMeta,
  applyCommand,
  chainEntries,
  createSeedState,
  draftToInput,
  verifyChain,
  searchAudit,
  type AuditInput,
} from "@family-ledger/shared";
import { type LedgerStore, StoreConflictError } from "./storage/types";

export class StorageBusyError extends Error {
  constructor() {
    super("Storage busy");
    this.name = "StorageBusyError";
  }
}

export interface ServiceOptions {
  members: SeedMemberConfig[];
  seedStarterAccounts: boolean;
  now?: () => Date;
  newId?: () => string;
  maxAttempts?: number;
}

const SYSTEM_ACTOR = "system";

/**
 * Application operations over a LedgerStore. All writes go through
 * applyCommand (validation + audit drafts), are hash-chained into the audit
 * log, and committed with optimistic concurrency. If the store reports that
 * someone else committed first, the command is re-applied to the fresh state;
 * entity-level version checks inside applyCommand still stop a stale edit from
 * overwriting another member's change.
 */
export class LedgerService {
  private now: () => Date;
  private newId: () => string;
  private maxAttempts: number;

  constructor(
    private store: LedgerStore,
    private opts: ServiceOptions,
  ) {
    this.now = opts.now ?? (() => new Date());
    this.newId = opts.newId ?? (() => crypto.randomUUID());
    this.maxAttempts = opts.maxAttempts ?? 4;
  }

  /** Loads the ledger, creating it on first run. */
  async load(): Promise<{ state: LedgerState; version: string; head: { seq: number; hash: string } | null }> {
    const loaded = await this.store.load();
    if (loaded.state && loaded.version) {
      return { state: this.syncMembers(loaded.state), version: loaded.version, head: loaded.auditHead };
    }
    const seed = createSeedState(this.opts.members);
    if (!this.opts.seedStarterAccounts) seed.accounts = [];
    const at = this.now().toISOString();
    seed.updatedAt = at;
    const audit = await chainEntries(
      [
        {
          at,
          actorId: SYSTEM_ACTOR,
          category: "record",
          action: "ledger.created",
          summary: "Family Ledger was set up",
          changes: [],
        },
      ],
      loaded.auditHead,
      this.newId,
    );
    try {
      const { version } = await this.store.commit({
        expectedVersion: loaded.version,
        state: seed,
        audit,
        message: "Initialise ledger",
      });
      return { state: seed, version, head: audit[0]! };
    } catch (e) {
      if (e instanceof StoreConflictError) return this.load();
      throw e;
    }
  }

  /**
   * Membership is controlled by server configuration. Keep the ledger's member
   * list in step with it (new members appear; display names follow config).
   */
  private syncMembers(state: LedgerState): LedgerState {
    for (const m of this.opts.members) {
      const existing = state.members.find((x) => x.id === m.id);
      if (existing) {
        existing.displayName = m.displayName;
        existing.email = m.email;
      } else {
        const personId = `p_${m.id.replace(/^m_/, "")}`;
        state.members.push({
          id: m.id,
          personId,
          displayName: m.displayName,
          email: m.email,
          status: "active",
          createdAt: state.updatedAt,
        });
        if (!state.people.some((p) => p.id === personId)) {
          state.people.push({ id: personId, name: m.displayName, relation: "Family", memberId: m.id });
        }
      }
    }
    return state;
  }

  async getState(): Promise<LedgerState> {
    return (await this.load()).state;
  }

  async execute(command: Command | unknown, actorId: string): Promise<{ state: LedgerState; entityId: string }> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const { state, version, head } = await this.load();
      const at = this.now().toISOString();
      const result = applyCommand(state, command, { actorId, now: at, newId: this.newId });
      if (result.audit.length === 0) return { state: result.state, entityId: result.entityId };
      const audit = await chainEntries(
        result.audit.map((d) => draftToInput(d, actorId, at)),
        head,
        this.newId,
      );
      try {
        await this.store.commit({
          expectedVersion: version,
          state: result.state,
          audit,
          message: `${(command as Command).type ?? "update"}`,
        });
        return { state: result.state, entityId: result.entityId };
      } catch (e) {
        if (!(e instanceof StoreConflictError)) throw e;
        // Someone else saved first: reload and re-apply.
      }
    }
    throw new StorageBusyError();
  }

  /** Append audit-only entries (security actions) with the same chaining and retry. */
  async recordAudit(entries: Array<Omit<AuditInput, "at"> & { at?: string }>): Promise<void> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const { version, head } = await this.load();
      const at = this.now().toISOString();
      const audit = await chainEntries(
        entries.map((e) => ({ ...e, at: e.at ?? at })),
        head,
        this.newId,
      );
      try {
        await this.store.commit({ expectedVersion: version, audit, message: "Security event" });
        return;
      } catch (e) {
        if (!(e instanceof StoreConflictError)) throw e;
      }
    }
    throw new StorageBusyError();
  }

  /* ---- Convenience operations (the storage-adapter API surface) ---- */

  async listAccounts(includeArchived = false): Promise<Account[]> {
    return (await this.getState()).accounts.filter((a) => includeArchived || !a.archivedAt);
  }
  async getAccount(id: string): Promise<Account | undefined> {
    return (await this.getState()).accounts.find((a) => a.id === id);
  }
  createAccount(data: Extract<Command, { type: "account.create" }>["data"], actorId: string) {
    return this.execute({ type: "account.create", data }, actorId);
  }
  updateAccount(
    id: string,
    expectedVersion: number,
    patch: Extract<Command, { type: "account.update" }>["patch"],
    actorId: string,
  ) {
    return this.execute({ type: "account.update", id, expectedVersion, patch }, actorId);
  }
  archiveAccount(id: string, expectedVersion: number, actorId: string) {
    return this.execute({ type: "account.archive", id, expectedVersion }, actorId);
  }
  restoreAccount(id: string, actorId: string) {
    return this.execute({ type: "account.restore", id }, actorId);
  }
  async listPlans(): Promise<Plan[]> {
    return (await this.getState()).plans.filter((p) => !p.archivedAt);
  }
  updatePlan(
    id: string,
    expectedVersion: number,
    patch: Extract<Command, { type: "plan.update" }>["patch"],
    actorId: string,
  ) {
    return this.execute({ type: "plan.update", id, expectedVersion, patch }, actorId);
  }
  async listNotes(): Promise<Note[]> {
    return (await this.getState()).notes.filter((n) => !n.archivedAt);
  }
  addNote(data: Extract<Command, { type: "note.create" }>["data"], actorId: string) {
    return this.execute({ type: "note.create", data }, actorId);
  }

  async getAuditHistory(params: { q?: string; entityId?: string; beforeSeq?: number; limit?: number }): Promise<{
    entries: AuditEntry[];
    nextCursor?: string;
    chainVerified: boolean;
  }> {
    const all = await this.store.readAudit();
    const chain = await verifyChain(all);
    let entries = [...all].reverse();
    if (params.entityId) entries = entries.filter((e) => e.entityId === params.entityId);
    if (params.q) entries = searchAudit(entries, params.q);
    if (params.beforeSeq !== undefined) entries = entries.filter((e) => e.seq < params.beforeSeq!);
    const limit = Math.min(params.limit ?? 50, 200);
    const page = entries.slice(0, limit);
    return {
      entries: page,
      nextCursor: entries.length > limit ? String(page[page.length - 1]!.seq) : undefined,
      chainVerified: chain.ok,
    };
  }

  async createSnapshot(label: string, actorId: string): Promise<SnapshotMeta> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const { state, version, head } = await this.load();
      const at = this.now().toISOString();
      const meta: SnapshotMeta = {
        id: `snap_${this.newId().replace(/-/g, "").slice(0, 20)}`,
        createdAt: at,
        createdBy: actorId,
        label,
        revision: state.revision,
      };
      const audit = await chainEntries(
        [
          {
            at,
            actorId,
            category: "record",
            action: "snapshot.create",
            summary: `Saved a backup: “${label}”`,
            changes: [],
          },
        ],
        head,
        this.newId,
      );
      try {
        await this.store.commit({
          expectedVersion: version,
          audit,
          snapshot: { meta, state },
          message: "Backup snapshot",
        });
        return meta;
      } catch (e) {
        if (!(e instanceof StoreConflictError)) throw e;
      }
    }
    throw new StorageBusyError();
  }

  listSnapshots(): Promise<SnapshotMeta[]> {
    return this.store.listSnapshots();
  }

  /**
   * Restore a snapshot. The current ledger is first saved as its own
   * snapshot, so a restore is itself reversible. Entity versions are bumped
   * past both copies so any edit form opened before the restore is refused
   * rather than silently applied to restored data.
   */
  async restoreSnapshot(id: string, actorId: string): Promise<LedgerState | null> {
    const snap = await this.store.readSnapshot(id);
    if (!snap) return null;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const { state: current, version, head } = await this.load();
      const at = this.now().toISOString();
      const restored = structuredClone(snap);
      const bump = <T extends { id: string; version: number }>(list: T[], prev: T[]) =>
        list.forEach((e) => {
          const before = prev.find((p) => p.id === e.id);
          e.version = Math.max(e.version, before?.version ?? 0) + 1;
        });
      bump(restored.accounts, current.accounts);
      bump(restored.plans, current.plans);
      bump(restored.notes, current.notes);
      bump(restored.checks, current.checks);
      bump(restored.documents, current.documents);
      restored.members = current.members;
      restored.revision = current.revision + 1;
      restored.updatedAt = at;
      const safety: SnapshotMeta = {
        id: `snap_${this.newId().replace(/-/g, "").slice(0, 20)}`,
        createdAt: at,
        createdBy: actorId,
        label: "Automatic copy before restoring a backup",
        revision: current.revision,
      };
      const audit = await chainEntries(
        [
          {
            at,
            actorId,
            category: "record",
            action: "snapshot.restore",
            summary: `Restored a backup (${id}). The previous version was saved first.`,
            changes: [],
          },
        ],
        head,
        this.newId,
      );
      try {
        await this.store.commit({
          expectedVersion: version,
          state: this.syncMembers(restored),
          audit,
          snapshot: { meta: safety, state: current },
          message: "Restore snapshot",
        });
        return restored;
      } catch (e) {
        if (!(e instanceof StoreConflictError)) throw e;
      }
    }
    throw new StorageBusyError();
  }

  async exportAll(): Promise<{ exportedAt: string; ledger: LedgerState; audit: AuditEntry[] }> {
    const state = await this.getState();
    const audit = await this.store.readAudit();
    return { exportedAt: this.now().toISOString(), ledger: state, audit };
  }
}
