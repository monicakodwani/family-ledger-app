import { describe, expect, it, vi } from "vitest";
import { LedgerClientError, verifyChain } from "@family-ledger/shared";
import { DemoLedgerClient } from "./demoClient";

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

async function signedIn(member = "m_mumma") {
  const client = new DemoLedgerClient();
  await client.signIn(member);
  return client;
}

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return err instanceof LedgerClientError ? err.code : "other";
  }
}

describe("DemoLedgerClient", () => {
  it("requires sign-in and starts from the seed with seed commands applied", async () => {
    const client = new DemoLedgerClient();
    expect(await codeOf(client.getLedger())).toBe("unauthenticated");
    await client.signIn("m_mumma");
    const { ledger } = await client.getLedger();
    expect(ledger.accounts.some((a) => a.id === "acc_rohit_portfolio")).toBe(true);
    expect(ledger.plans.length).toBeGreaterThanOrEqual(2);
    expect(ledger.checks.length).toBeGreaterThanOrEqual(4);
    const session = await client.getSession();
    expect(session.member.displayName).toBe("Neeta");
    expect(session.mode).toBe("demo");
  });

  it("applies commands as the signed-in member and records a verified audit chain", async () => {
    const client = await signedIn("m_papa");
    const res = await client.sendCommand({
      type: "valuation.add",
      accountId: "acc_rohit_portfolio",
      valuation: { amountMinor: "120000000", valuationDate: "2026-10-12", source: "estimate", confidence: "estimated" },
    });
    expect(res.ledger.accounts.find((a) => a.id === "acc_rohit_portfolio")?.valuations).toHaveLength(1);
    const audit = await client.getAudit();
    const latest = audit.entries[0]!;
    expect(latest.actorId).toBe("m_papa");
    expect(latest.summary).toContain("₹12 lakh");
    expect(audit.chainVerified).toBe(true);
    const filtered = await client.getAudit({ entityId: "acc_rohit_portfolio" });
    expect(filtered.entries.every((e) => e.entityId === "acc_rohit_portfolio")).toBe(true);
    expect((await client.getAudit({ q: "12 lakh" })).entries.length).toBeGreaterThan(0);
  });

  it("maps domain errors to friendly client errors with the current version", async () => {
    const client = await signedIn();
    const err = await client
      .sendCommand({ type: "account.update", id: "acc_fd", expectedVersion: 99, patch: { nickname: "x" } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LedgerClientError);
    expect((err as LedgerClientError).code).toBe("version_conflict");
    expect((err as LedgerClientError).current).toMatchObject({ id: "acc_fd" });
  });

  it("masks access details in the ledger and reveals them only after fresh auth", async () => {
    const client = await signedIn();
    const { ledger } = await client.getLedger();
    const masked = ledger.accounts.find((a) => a.id === "acc_rohit_portfolio")!.access;
    expect(masked.registeredEmail).not.toContain("family.demo@example.com");
    expect(masked.registeredEmail).toContain("•");
    expect(masked.registeredPhone).toContain("0001");
    expect(masked.registeredPhone).not.toContain("90000 00001");
    expect(await codeOf(client.revealAccess("acc_rohit_portfolio"))).toBe("reauth_required");
    client.confirmFreshAuth();
    const revealed = await client.revealAccess("acc_rohit_portfolio");
    expect(revealed.access.registeredEmail).toBe("family.demo@example.com");
    const audit = await client.getAudit();
    expect(audit.entries[0]!.action).toBe("access.reveal");
    expect(audit.entries[0]!.category).toBe("security");
  });

  it("masks access details inside audit change history", async () => {
    const client = await signedIn();
    client.confirmFreshAuth();
    const { access } = await client.revealAccess("acc_icici_mf");
    const { ledger } = await client.getLedger();
    const account = ledger.accounts.find((a) => a.id === "acc_icici_mf")!;
    await client.sendCommand({
      type: "account.update",
      id: account.id,
      expectedVersion: account.version,
      patch: { access: { ...access, registeredPhone: "+91 90000 00999" } },
    });
    const text = JSON.stringify((await client.getAudit({ entityId: account.id })).entries);
    expect(text).not.toContain("chandra.demo@example.com");
    expect(text).not.toContain("90000 00999");
  });

  it("revoking the current session signs you out", async () => {
    const client = await signedIn();
    const ended = vi.fn();
    client.setSessionEndedHandler(ended);
    const security = await client.getSecurity();
    const current = security.sessions.find((s) => s.current)!;
    const other = security.sessions.find((s) => !s.current && s.memberId === current.memberId)!;
    expect(other.label).toBe("Neeta's iPhone");
    await client.revokeSession(other.id);
    expect((await client.getSecurity()).sessions.map((s) => s.id)).not.toContain(other.id);
    expect(ended).not.toHaveBeenCalled();
    await client.revokeSession(current.id);
    expect(ended).toHaveBeenCalledWith("session_revoked");
    expect(await codeOf(client.getLedger())).toBe("unauthenticated");
  });

  it("sign out everywhere needs fresh auth", async () => {
    const client = await signedIn();
    expect(await codeOf(client.revokeAllMySessions())).toBe("reauth_required");
    client.confirmFreshAuth();
    await client.revokeAllMySessions();
    expect(await codeOf(client.getSession())).toBe("unauthenticated");
  });

  it("emergency lock needs two approvals from members other than the target", async () => {
    const client = await signedIn("m_mumma");
    client.confirmFreshAuth();
    const req = await client.createEmergency({ kind: "lock", targetMemberId: "m_papa", reason: "Phone stolen" });
    expect(req.approvals).toEqual(["m_mumma"]);
    expect(req.status).toBe("pending");
    expect(await codeOf(client.approveEmergency(req.id))).toBe("invalid"); // already approved
    await client.signOut();

    await client.signIn("m_papa");
    client.confirmFreshAuth();
    expect(await codeOf(client.approveEmergency(req.id))).toBe("forbidden"); // target can't approve
    await client.signOut();

    await client.signIn("m_me");
    client.confirmFreshAuth();
    const done = await client.approveEmergency(req.id);
    expect(done.status).toBe("completed");
    const security = await client.getSecurity();
    expect(security.members.find((m) => m.id === "m_papa")?.status).toBe("locked");
    await client.signOut();
    expect(await codeOf(client.signIn("m_papa"))).toBe("member_locked");
  });

  it("snapshots restore records and export returns JSON", async () => {
    const client = await signedIn();
    client.confirmFreshAuth();
    const snap = await client.createSnapshot("Before test");
    await client.sendCommand({ type: "check.create", title: "Temporary check" });
    expect((await client.getLedger()).ledger.checks.some((c) => c.title === "Temporary check")).toBe(true);
    await client.restoreSnapshot(snap.id);
    expect((await client.getLedger()).ledger.checks.some((c) => c.title === "Temporary check")).toBe(false);
    const blob = await client.exportData();
    expect(blob.type).toBe("application/json");
    const parsed = JSON.parse(await readBlob(blob)) as { mode: string };
    expect(parsed.mode).toBe("demo");
  });

  it("fills clearly labelled sample amounts", async () => {
    const client = await signedIn();
    const count = await client.fillSampleAmounts();
    expect(count).toBeGreaterThanOrEqual(6);
    const { ledger } = await client.getLedger();
    const v = ledger.accounts.find((a) => a.id === "acc_icici_mf")!.valuations;
    expect(v.length).toBe(2);
    expect(v.every((x) => x.sourceNote?.includes("Fictional sample"))).toBe(true);
    expect(client.hasSampleAmounts()).toBe(true);
  });

  it("keeps an intact hash chain across many changes", async () => {
    const client = await signedIn();
    await Promise.all([
      client.sendCommand({ type: "check.create", title: "A" }),
      client.sendCommand({ type: "check.create", title: "B" }),
      client.sendCommand({ type: "check.create", title: "C" }),
    ]);
    const page = await client.getAudit();
    expect(page.chainVerified).toBe(true);
    const seqs = page.entries.map((e) => e.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect((await verifyChain([])).ok).toBe(true);
  });
});
