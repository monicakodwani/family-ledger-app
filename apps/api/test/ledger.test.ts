import { describe, expect, it } from "vitest";
import { makeHarness } from "./harness";

describe("ledger API", () => {
  it("initialises from config, returns masked data, and records commands in the audit trail", async () => {
    const h = await makeHarness();
    const mumma = await h.token("m_mumma");
    const ledger = await h.call("GET", "/api/ledger", { token: mumma });
    expect(ledger.status).toBe(200);
    expect(ledger.json.ledger.accounts.length).toBe(12);
    expect(ledger.json.ledger.members.map((m: { displayName: string }) => m.displayName)).toEqual([
      "Mumma",
      "Papa",
      "Riya",
    ]);
    // No fictional demo notes/plans in a real ledger.
    expect(ledger.json.ledger.notes).toEqual([]);

    const add = await h.call("POST", "/api/commands", {
      token: mumma,
      body: {
        command: {
          type: "valuation.add",
          accountId: "acc_rohit_portfolio",
          valuation: {
            amountMinor: "1200000000",
            valuationDate: "2026-10-10",
            source: "app_or_website",
            confidence: "estimated",
          },
        },
      },
    });
    expect(add.status).toBe(200);
    expect(add.json.revision).toBe(1);

    const audit = await h.call("GET", "/api/audit?entityId=acc_rohit_portfolio", { token: mumma });
    expect(audit.json.chainVerified).toBe(true);
    expect(audit.json.entries[0].actorId).toBe("m_mumma");
    expect(audit.json.entries[0].summary).toContain("₹1.2 crore");
    expect(audit.json.entries[0].changes[0].after.amountMinor).toBe("1200000000");
  });

  it("returns a friendly 409 with the current record on stale edits", async () => {
    const h = await makeHarness();
    const papa = await h.token("m_papa");
    const mumma = await h.token("m_mumma");
    const cmd = (nickname: string) => ({
      command: { type: "account.update", id: "acc_fd", expectedVersion: 0, patch: { nickname } },
    });
    expect((await h.call("POST", "/api/commands", { token: papa, body: cmd("Papa's FD") })).status).toBe(200);
    const res = await h.call("POST", "/api/commands", { token: mumma, body: cmd("Old FD") });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("version_conflict");
    expect(res.json.error.message).toMatch(/Someone else changed/);
    expect(res.json.error.current.nickname).toBe("Papa's FD");
    expect(res.json.error.current.access).toBeUndefined();
  });

  it("validates commands with friendly messages", async () => {
    const h = await makeHarness();
    const t = await h.token("m_me");
    const bad = await h.call("POST", "/api/commands", {
      token: t,
      body: { command: { type: "account.create", data: { displayName: "", assetClass: "cash" } } },
    });
    expect(bad.status).toBe(400);
    expect(bad.json.error.message).not.toMatch(/zod|ZodError|stack/i);
    const unknown = await h.call("POST", "/api/commands", { token: t, body: { command: { type: "drop.tables" } } });
    expect(unknown.status).toBe(400);
    const big = await h.call("POST", "/api/commands", {
      token: t,
      body: { command: { type: "check.create", title: "x".repeat(70_000) } },
    });
    expect(big.status).toBe(400);
  });

  it("only reveals contact details with fresh auth, and records who looked", async () => {
    const h = await makeHarness();
    const signIn = h.now();
    const t = await h.token("m_me", { authTime: signIn });
    const ledger = await h.call("GET", "/api/ledger", { token: t });
    const fd = ledger.json.ledger.accounts.find((a: { id: string }) => a.id === "acc_fd");
    await h.call("POST", "/api/commands", {
      token: t,
      body: {
        command: {
          type: "account.update",
          id: "acc_fd",
          expectedVersion: fd.version,
          patch: {
            access: {
              registeredPhone: "+91 90000 00001",
              registeredEmail: "papa@example.com",
              authenticator: "no",
              contacts: [],
            },
          },
        },
      },
    });
    const masked = await h.call("GET", "/api/ledger", { token: t });
    const access = masked.json.ledger.accounts.find((a: { id: string }) => a.id === "acc_fd").access;
    expect(access.registeredPhone).toBe("•••• •• 0001");
    expect(JSON.stringify(masked.json)).not.toContain("90000 00001");

    // The activity log must not leak the unmasked values either.
    const log = await h.call("GET", "/api/audit", { token: t });
    expect(JSON.stringify(log.json)).not.toContain("90000 00001");
    expect(JSON.stringify(log.json)).not.toContain("papa@example.com");

    const revealed = await h.call("POST", "/api/accounts/acc_fd/reveal", { token: t });
    expect(revealed.json.access.registeredPhone).toBe("+91 90000 00001");
    const audit = await h.call("GET", "/api/audit?entityId=acc_fd", { token: t });
    expect(audit.json.entries[0].action).toBe("access.reveal");

    h.advance(6 * 60_000);
    const stale = await h.call("POST", "/api/accounts/acc_fd/reveal", { token: t });
    expect(stale.json.error.code).toBe("reauth_required");
  });

  it("creates and restores snapshots, saving the current state first", async () => {
    const h = await makeHarness();
    const t = await h.token("m_me");
    await h.call("GET", "/api/ledger", { token: t });
    const snap = await h.call("POST", "/api/snapshots", { token: t, body: { label: "Before cleanup" } });
    expect(snap.status).toBe(200);
    await h.call("POST", "/api/commands", {
      token: t,
      body: { command: { type: "account.archive", id: "acc_gold", expectedVersion: 0 } },
    });
    const archived = await h.call("GET", "/api/ledger", { token: t });
    expect(archived.json.ledger.accounts.find((a: { id: string }) => a.id === "acc_gold").archivedAt).toBeDefined();

    expect((await h.call("POST", `/api/snapshots/${snap.json.id}/restore`, { token: t })).status).toBe(200);
    const restored = await h.call("GET", "/api/ledger", { token: t });
    const gold = restored.json.ledger.accounts.find((a: { id: string }) => a.id === "acc_gold");
    expect(gold.archivedAt).toBeUndefined();
    expect(gold.version).toBeGreaterThan(1); // stale edit forms are refused after a restore
    const list = await h.call("GET", "/api/snapshots", { token: t });
    expect(list.json.map((s: { label: string }) => s.label)).toContain("Automatic copy before restoring a backup");
  });

  it("exports with fresh auth and an attachment header", async () => {
    const h = await makeHarness();
    const t = await h.token("m_me");
    const res = await h.call("GET", "/api/export", { token: t });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.json.ledger.accounts.length).toBe(12);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("detects audit tampering outside the app", async () => {
    const h = await makeHarness();
    const t = await h.token("m_me");
    await h.call("POST", "/api/commands", {
      token: t,
      body: { command: { type: "check.create", title: "Confirm PF" } },
    });
    h.store._rawAudit()[0]!.summary = "Rewritten history";
    const audit = await h.call("GET", "/api/audit", { token: t });
    expect(audit.json.chainVerified).toBe(false);
  });

  it("rate limits bursts of writes", async () => {
    const h = await makeHarness();
    const t = await h.token("m_me");
    let status = 0;
    for (let i = 0; i < 62; i++) {
      status = (
        await h.call("POST", "/api/commands", { token: t, body: { command: { type: "check.create", title: `c${i}` } } })
      ).status;
    }
    expect(status).toBe(429);
  });
});

describe("concurrent edits", () => {
  it("retries store-level conflicts for unrelated changes without losing either", async () => {
    const h = await makeHarness();
    await h.service.getState();
    // Both members read the same version; whoever commits second hits a store conflict and retries.
    let conflicts = 0;
    const original = h.store.commit.bind(h.store);
    h.store.commit = async (input) => {
      try {
        return await original(input);
      } catch (e) {
        conflicts++;
        throw e;
      }
    };
    const [a, b] = await Promise.all([
      h.service.execute({ type: "check.create", title: "From Mumma" }, "m_mumma"),
      h.service.execute({ type: "check.create", title: "From Papa" }, "m_papa"),
    ]);
    expect(a.entityId).not.toBe(b.entityId);
    const state = await h.service.getState();
    expect(state.checks.map((c) => c.title).sort()).toEqual(["From Mumma", "From Papa"]);
    expect(conflicts).toBeGreaterThanOrEqual(1);
    const audit = await h.service.getAuditHistory({});
    expect(audit.chainVerified).toBe(true);
  });

  it("never silently overwrites when two people edit the same record", async () => {
    const h = await makeHarness();
    await h.service.getState();
    const results = await Promise.allSettled([
      h.service.updateAccount("acc_gold", 0, { description: "Mumma's version" }, "m_mumma"),
      h.service.updateAccount("acc_gold", 0, { description: "Papa's version" }, "m_papa"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const state = await h.service.getState();
    expect(state.accounts.find((a) => a.id === "acc_gold")!.version).toBe(1);
  });
});
