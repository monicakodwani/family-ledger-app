/**
 * Family Ledger offline backup tool. Operates on a LOCAL CLONE of the private
 * data repository. Keys are read from the environment, never from arguments,
 * so they don't land in shell history.
 *
 *   DATA_ENCRYPTION_KEYS='{"k1":"..."}' DATA_ACTIVE_KEY_ID=k1 \
 *     npm run backup-tool -w @family-ledger/api -- verify ../family-ledger-private-data
 *
 * Commands:
 *   genkey                 print a new random 32-byte key (base64)
 *   verify <dir>           decrypt every file, check the audit hash chain, print counts only
 *   rekey <dir>            re-encrypt every file with DATA_ACTIVE_KEY_ID (then review, commit, push)
 *   export <dir> <out>     write a DECRYPTED JSON export (handle with care; delete when done)
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { migrateState } from "@family-ledger/shared";
import { AesGcmCodec, generateKeyBase64 } from "../src/crypto";
import { type FileAccess, rekeyBackup, verifyBackup } from "../src/backup";

function localFiles(root: string): FileAccess {
  async function walk(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(full)));
      else out.push(relative(root, full).split("\\").join("/"));
    }
    return out;
  }
  return {
    list: () => walk(root),
    read: (p) => readFile(join(root, p), "utf8"),
    write: (p, c) => writeFile(join(root, p), c, "utf8"),
  };
}

async function codecFromEnv() {
  const keys = process.env.DATA_ENCRYPTION_KEYS;
  const active = process.env.DATA_ACTIVE_KEY_ID;
  if (!keys || !active) throw new Error("Set DATA_ENCRYPTION_KEYS and DATA_ACTIVE_KEY_ID in the environment.");
  return AesGcmCodec.fromConfig(keys, active);
}

async function main() {
  const [cmd, dir, out] = process.argv.slice(2);
  if (cmd === "genkey") {
    console.log(generateKeyBase64());
    return;
  }
  if (!dir) throw new Error("Usage: backup-tool <genkey|verify|rekey|export> <dir> [out]");
  const files = localFiles(dir);
  const codec = await codecFromEnv();
  if (cmd === "verify") {
    const report = await verifyBackup(files, codec);
    console.log(JSON.stringify(report, null, 2));
    if (!report.auditChainOk) process.exitCode = 2;
  } else if (cmd === "rekey") {
    const n = await rekeyBackup(files, codec);
    console.log(
      `Re-encrypted ${n} file(s) with key ${codec.activeKeyId}. Review with git diff --stat, then commit and push.`,
    );
  } else if (cmd === "export") {
    if (!out) throw new Error("Usage: backup-tool export <dir> <out.json>");
    const state = migrateState(await codec.decode("ledger/state.json.enc", await files.read("ledger/state.json.enc")));
    await writeFile(out, JSON.stringify(state, null, 2), { mode: 0o600 });
    console.log(
      `Wrote decrypted export to ${out}. This file is NOT encrypted — store it safely and delete it when done.`,
    );
  } else {
    throw new Error(`Unknown command ${cmd}`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "Failed");
  process.exitCode = 1;
});
