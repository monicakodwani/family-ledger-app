import { LedgerState, SCHEMA_VERSION } from "./schema";

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Ordered migrations keyed by the version they upgrade FROM.
 * Example for the future: 1: (s) => ({ ...s, schemaVersion: 2, newField: [] })
 */
const MIGRATIONS: Record<number, Migration> = {};

export function migrateState(raw: unknown): LedgerState {
  if (!raw || typeof raw !== "object") throw new Error("Ledger state is not an object");
  let current = raw as Record<string, unknown>;
  let version = Number(current.schemaVersion);
  if (!Number.isInteger(version) || version < 1) throw new Error("Unknown ledger schema version");
  if (version > SCHEMA_VERSION) throw new Error("Ledger was written by a newer app version");
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new Error(`No migration from schema version ${version}`);
    current = migrate(current);
    version = Number(current.schemaVersion);
  }
  return LedgerState.parse(current);
}
