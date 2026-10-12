import { type AuditEntry, type LedgerState, migrateState, verifyChain } from "@family-ledger/shared";
import type { AesGcmCodec } from "./crypto";

/**
 * Offline backup operations on a local clone of the private data repository.
 * File access is injected so the logic is testable and runs under Node.
 */
export interface FileAccess {
  list(): Promise<string[]>; // repo-relative paths
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
}

export interface VerifyReport {
  files: number;
  accounts: number;
  plans: number;
  notes: number;
  auditEntries: number;
  auditChainOk: boolean;
  snapshots: number;
  keyIds: Record<string, number>;
}

export async function verifyBackup(files: FileAccess, codec: AesGcmCodec): Promise<VerifyReport> {
  const paths = (await files.list()).filter((p) => p.endsWith(".enc"));
  const keyIds: Record<string, number> = {};
  let state: LedgerState | null = null;
  const audit: AuditEntry[] = [];
  let snapshots = 0;
  for (const path of paths) {
    const text = await files.read(path);
    const kid = codec.keyIdOf(text) ?? "unknown";
    keyIds[kid] = (keyIds[kid] ?? 0) + 1;
    const value = await codec.decode(path, text); // throws if any file is unreadable
    if (path === "ledger/state.json.enc") state = migrateState(value);
    else if (/^audit\/\d{4}-\d{2}\.json\.enc$/.test(path)) audit.push(...(value as AuditEntry[]));
    else if (/^snapshots\/snap_[\w-]+\.json\.enc$/.test(path)) {
      migrateState(value);
      snapshots++;
    }
  }
  if (!state) throw new Error("No ledger/state.json.enc found — is this the private data repository?");
  const chain = await verifyChain(audit);
  return {
    files: paths.length,
    accounts: state.accounts.length,
    plans: state.plans.length,
    notes: state.notes.length,
    auditEntries: audit.length,
    auditChainOk: chain.ok,
    snapshots,
    keyIds,
  };
}

/** Re-encrypt every file with the codec's active key (after adding a new key). */
export async function rekeyBackup(files: FileAccess, codec: AesGcmCodec): Promise<number> {
  let count = 0;
  for (const path of (await files.list()).filter((p) => p.endsWith(".enc"))) {
    const text = await files.read(path);
    if (codec.keyIdOf(text) === codec.activeKeyId) continue;
    await files.write(path, await codec.encode(path, await codec.decode(path, text)));
    count++;
  }
  return count;
}
