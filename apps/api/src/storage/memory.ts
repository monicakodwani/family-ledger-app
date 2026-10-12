import type { AuditEntry, LedgerState, SnapshotMeta } from "@family-ledger/shared";
import {
  type AuditHead,
  type CommitInput,
  type LedgerStore,
  type LoadedLedger,
  StoreConflictError,
  monthOf,
} from "./types";

/** In-memory store for tests and local development. Not durable. */
export class MemoryLedgerStore implements LedgerStore {
  private version = 0;
  private state: LedgerState | null = null;
  private audit: AuditEntry[] = [];
  private head: AuditHead | null = null;
  private snapshots = new Map<string, { meta: SnapshotMeta; state: LedgerState }>();
  /** Test hook: run before a commit is applied (simulate a concurrent writer). */
  beforeCommit?: () => void;

  async load(): Promise<LoadedLedger> {
    return {
      state: this.state ? structuredClone(this.state) : null,
      version: this.version === 0 ? null : String(this.version),
      auditHead: this.head ? structuredClone(this.head) : null,
    };
  }

  async commit(input: CommitInput): Promise<{ version: string }> {
    const hook = this.beforeCommit;
    this.beforeCommit = undefined;
    hook?.();
    const current = this.version === 0 ? null : String(this.version);
    if (input.expectedVersion !== current) throw new StoreConflictError();
    if (input.state) this.state = structuredClone(input.state);
    if (input.audit.length) {
      this.audit.push(...structuredClone(input.audit));
      const last = input.audit[input.audit.length - 1]!;
      const months = new Set(this.head?.months ?? []);
      input.audit.forEach((e) => months.add(monthOf(e.at)));
      this.head = { seq: last.seq, hash: last.hash, months: [...months].sort() };
    }
    if (input.snapshot) this.snapshots.set(input.snapshot.meta.id, structuredClone(input.snapshot));
    this.version += 1;
    return { version: String(this.version) };
  }

  async readAudit(): Promise<AuditEntry[]> {
    return structuredClone(this.audit);
  }

  async listSnapshots(): Promise<SnapshotMeta[]> {
    return [...this.snapshots.values()].map((s) => s.meta).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async readSnapshot(id: string): Promise<LedgerState | null> {
    const snap = this.snapshots.get(id);
    return snap ? structuredClone(snap.state) : null;
  }

  /** Test helper: raw access to simulate tampering. */
  _rawAudit(): AuditEntry[] {
    return this.audit;
  }
}
