import { describe, expect, it } from "vitest";
import { chainEntries, createSeedState, verifyChain } from "@family-ledger/shared";
import { AesGcmCodec, DecryptionError, generateKeyBase64 } from "../src/crypto";
import { LedgerService } from "../src/service";
import { GitHubLedgerStore } from "../src/storage/github";
import { StoreConflictError } from "../src/storage/types";
import { createFakeGitHub } from "./fake-github";
import { MEMBERS } from "./harness";

const k1 = generateKeyBase64();
const k2 = generateKeyBase64();

describe("encrypted record round trip", () => {
  it("encrypts and decrypts, with a fresh IV each time", async () => {
    const codec = await AesGcmCodec.fromConfig(JSON.stringify({ k1 }), "k1");
    const value = { account: "Rohit Portfolio", amountMinor: "1200000000" };
    const a = await codec.encode("ledger/state.json.enc", value);
    const b = await codec.encode("ledger/state.json.enc", value);
    expect(a).not.toBe(b);
    expect(a).not.toContain("Rohit");
    expect(await codec.decode("ledger/state.json.enc", a)).toEqual(value);
  });

  it("detects tampering, path swapping and wrong keys", async () => {
    const codec = await AesGcmCodec.fromConfig(JSON.stringify({ k1 }), "k1");
    const text = await codec.encode("ledger/state.json.enc", { x: 1 });
    const env = JSON.parse(text);
    const flipped = { ...env, ct: env.ct.slice(0, -4) + (env.ct.slice(-4) === "AAAA" ? "BBBB" : "AAAA") };
    await expect(codec.decode("ledger/state.json.enc", JSON.stringify(flipped))).rejects.toBeInstanceOf(
      DecryptionError,
    );
    await expect(codec.decode("audit/head.json.enc", text)).rejects.toBeInstanceOf(DecryptionError);
    const other = await AesGcmCodec.fromConfig(JSON.stringify({ k1: k2 }), "k1");
    await expect(other.decode("ledger/state.json.enc", text)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("supports key rotation: old ciphertext readable, new writes use the new key", async () => {
    const old = await AesGcmCodec.fromConfig(JSON.stringify({ k1 }), "k1");
    const rotated = await AesGcmCodec.fromConfig(JSON.stringify({ k1, k2 }), "k2");
    const text = await old.encode("p", { v: 1 });
    expect(await rotated.decode("p", text)).toEqual({ v: 1 });
    expect(JSON.parse(await rotated.encode("p", { v: 2 })).kid).toBe("k2");
  });

  it("rejects malformed key configuration", async () => {
    await expect(AesGcmCodec.fromConfig("not json", "k1")).rejects.toThrow();
    await expect(AesGcmCodec.fromConfig(JSON.stringify({ k1: "c2hvcnQ=" }), "k1")).rejects.toThrow(/32 bytes/);
    await expect(AesGcmCodec.fromConfig(JSON.stringify({ k1 }), "k9")).rejects.toThrow(/Active key/);
  });
});

async function makeStore() {
  const gh = createFakeGitHub();
  const codec = await AesGcmCodec.fromConfig(JSON.stringify({ k1 }), "k1");
  const store = new GitHubLedgerStore({
    owner: "fam",
    repo: "family-ledger-private-data",
    branch: "main",
    token: async () => "installation-token",
    codec,
    fetch: gh.fetch,
  });
  return { gh, store, codec };
}

describe("GitHub storage adapter", () => {
  it("initialises, commits atomically, and never writes plaintext to the repository", async () => {
    const { gh, store } = await makeStore();
    const service = new LedgerService(store, { members: MEMBERS, seedStarterAccounts: true });
    await service.execute(
      {
        type: "valuation.add",
        accountId: "acc_rohit_portfolio",
        valuation: {
          amountMinor: "1234567800",
          valuationDate: "2026-10-10",
          source: "statement",
          confidence: "verified",
        },
      },
      "m_papa",
    );
    const state = await service.getState();
    expect(state.accounts.find((a) => a.id === "acc_rohit_portfolio")!.valuations[0]!.amountMinor).toBe("1234567800");

    const files = gh.filesAtHead();
    expect(files).toEqual(expect.arrayContaining(["ledger/state.json.enc", "audit/head.json.enc", "FORMAT.md"]));
    for (const content of gh.allBlobContents()) {
      expect(content).not.toMatch(/Rohit|1234567800|mumma@example.com|Groww/);
    }
    // Commit messages are plaintext: generic only.
    expect(gh.headCommit().message).toBe("valuation.add");
    // Every request used the server-side token.
    expect(gh.requests.every((r) => r.auth === "Bearer installation-token")).toBe(true);

    const audit = await store.readAudit();
    expect(audit.map((e) => e.action)).toEqual(["ledger.created", "valuation.add"]);
    expect((await verifyChain(audit)).ok).toBe(true);
  });

  it("refuses to overwrite when someone else committed first", async () => {
    const { gh, store } = await makeStore();
    const service = new LedgerService(store, { members: MEMBERS, seedStarterAccounts: true });
    await service.getState();
    const loaded = await store.load();
    gh.advanceHeadExternally();
    const audit = await chainEntries(
      [{ at: new Date().toISOString(), actorId: "m_me", category: "record", action: "x", summary: "x", changes: [] }],
      loaded.auditHead,
      () => "e1",
    );
    await expect(
      store.commit({ expectedVersion: loaded.version, state: loaded.state!, audit, message: "x" }),
    ).rejects.toBeInstanceOf(StoreConflictError);
  });

  it("service retries after a ref conflict and the change still lands once", async () => {
    const { gh, store } = await makeStore();
    const service = new LedgerService(store, { members: MEMBERS, seedStarterAccounts: true });
    await service.getState();
    gh.failNextRefUpdate();
    await service.execute({ type: "check.create", title: "Confirm Nokia PF balance" }, "m_me");
    const state = await service.getState();
    expect(state.checks.filter((c) => c.title === "Confirm Nokia PF balance")).toHaveLength(1);
  });

  it("stores and restores encrypted snapshots", async () => {
    const { store } = await makeStore();
    const service = new LedgerService(store, { members: MEMBERS, seedStarterAccounts: true });
    const meta = await service.createSnapshot("Monthly backup", "m_me");
    await service.execute({ type: "account.archive", id: "acc_gold", expectedVersion: 0 }, "m_me");
    expect((await store.listSnapshots()).map((s) => s.id)).toContain(meta.id);
    await service.restoreSnapshot(meta.id, "m_me");
    const state = await service.getState();
    expect(state.accounts.find((a) => a.id === "acc_gold")!.archivedAt).toBeUndefined();
    expect(await store.readSnapshot("../../etc/passwd")).toBeNull();
  });

  it("seeds only starter accounts — never demo notes or plans — in a real ledger", async () => {
    const { store } = await makeStore();
    const service = new LedgerService(store, { members: MEMBERS, seedStarterAccounts: true });
    const state = await service.getState();
    expect(state.notes).toHaveLength(0);
    expect(state.plans).toHaveLength(0);
    expect(state.accounts.every((a) => a.valuations.length === 0)).toBe(true);
    expect(createSeedState().accounts.length).toBe(state.accounts.length);
  });
});
