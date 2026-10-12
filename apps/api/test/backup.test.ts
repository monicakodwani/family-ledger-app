import { describe, expect, it } from "vitest";
import { AesGcmCodec, generateKeyBase64 } from "../src/crypto";
import { type FileAccess, rekeyBackup, verifyBackup } from "../src/backup";
import { LedgerService } from "../src/service";
import { GitHubLedgerStore } from "../src/storage/github";
import { createFakeGitHub } from "./fake-github";
import { MEMBERS } from "./harness";

/** Build a populated fake repository, then "clone" its head files into a map. */
async function populatedClone() {
  const k1 = generateKeyBase64();
  const gh = createFakeGitHub();
  const codec = await AesGcmCodec.fromConfig(JSON.stringify({ k1 }), "k1");
  const store = new GitHubLedgerStore({
    owner: "fam",
    repo: "family-ledger-private-data",
    branch: "main",
    token: async () => "t",
    codec,
    fetch: gh.fetch,
  });
  const service = new LedgerService(store, { members: MEMBERS, seedStarterAccounts: true });
  await service.execute({ type: "check.create", title: "Confirm Nokia PF balance" }, "m_me");
  await service.createSnapshot("Before trip", "m_papa");
  const files = new Map<string, string>();
  for (const path of gh.filesAtHead()) {
    const res = await gh.fetch(`https://api.github.com/repos/fam/family-ledger-private-data/contents/${path}`);
    files.set(path, await res.text());
  }
  const access: FileAccess = {
    list: async () => [...files.keys()],
    read: async (p) => files.get(p)!,
    write: async (p, c) => void files.set(p, c),
  };
  return { k1, files, access };
}

describe("backup and restore procedures", () => {
  it("verifies a cloned backup end to end", async () => {
    const { k1, access } = await populatedClone();
    const report = await verifyBackup(access, await AesGcmCodec.fromConfig(JSON.stringify({ k1 }), "k1"));
    expect(report).toMatchObject({
      accounts: 12,
      auditEntries: 3,
      auditChainOk: true,
      snapshots: 1,
      keyIds: { k1: expect.any(Number) },
    });
  });

  it("fails loudly without the right key", async () => {
    const { access } = await populatedClone();
    const wrong = await AesGcmCodec.fromConfig(JSON.stringify({ k1: generateKeyBase64() }), "k1");
    await expect(verifyBackup(access, wrong)).rejects.toThrow();
  });

  it("rotates keys: after rekey, the old key is no longer needed for current files", async () => {
    const { k1, access } = await populatedClone();
    const k2 = generateKeyBase64();
    const both = await AesGcmCodec.fromConfig(JSON.stringify({ k1, k2 }), "k2");
    expect(await rekeyBackup(access, both)).toBeGreaterThan(0);
    const onlyNew = await AesGcmCodec.fromConfig(JSON.stringify({ k2 }), "k2");
    const report = await verifyBackup(access, onlyNew);
    expect(report.keyIds).toEqual({ k2: report.files });
    expect(report.auditChainOk).toBe(true);
  });
});
