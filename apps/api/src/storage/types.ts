import type { AuditEntry, LedgerState, SnapshotMeta } from "@family-ledger/shared";

export interface AuditHead {
  seq: number;
  hash: string;
  /** Months (YYYY-MM) that have audit files, oldest first. */
  months: string[];
}

export interface LoadedLedger {
  state: LedgerState | null;
  /** Opaque version token (a commit SHA for GitHub). null = empty store. */
  version: string | null;
  auditHead: AuditHead | null;
}

export interface CommitInput {
  expectedVersion: string | null;
  /** Omit to leave the ledger unchanged (audit-only commit). */
  state?: LedgerState;
  audit: AuditEntry[];
  message: string;
  snapshot?: { meta: SnapshotMeta; state: LedgerState };
}

/**
 * Persistence boundary. The GitHub implementation is the initial production
 * backend; a PostgreSQL implementation can replace it without changing the
 * service or routes (see docs/ARCHITECTURE.md → "Migrating to PostgreSQL").
 *
 * Contract:
 *  - commit() is atomic: state, audit and snapshot are written together or not at all.
 *  - commit() MUST fail with StoreConflictError if the stored version is not
 *    expectedVersion (optimistic concurrency). It must never overwrite.
 *  - There is no operation to modify or delete existing audit entries.
 */
export interface LedgerStore {
  load(): Promise<LoadedLedger>;
  commit(input: CommitInput): Promise<{ version: string }>;
  /** All audit entries, oldest first. */
  readAudit(): Promise<AuditEntry[]>;
  listSnapshots(): Promise<SnapshotMeta[]>;
  readSnapshot(id: string): Promise<LedgerState | null>;
}

export class StoreConflictError extends Error {
  constructor() {
    super("The ledger changed since it was read");
    this.name = "StoreConflictError";
  }
}

export class StoreUnavailableError extends Error {
  constructor(message = "Storage is unavailable") {
    super(message);
    this.name = "StoreUnavailableError";
  }
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}
