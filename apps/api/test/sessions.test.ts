import { describe, expect, it } from "vitest";
import { makeHarness } from "./harness";

describe("session revocation", () => {
  it("a revoked device stays out even after refreshing its token", async () => {
    const h = await makeHarness();
    const phone = await h.token("m_mumma", { sessionId: "mumma-phone" });
    const ipad = await h.token("m_mumma", { sessionId: "mumma-ipad" });
    expect((await h.call("GET", "/api/ledger", { token: phone })).status).toBe(200);
    expect((await h.call("GET", "/api/ledger", { token: ipad })).status).toBe(200);

    expect((await h.call("POST", "/api/security/sessions/mumma-phone/revoke", { token: ipad })).status).toBe(200);
    const after = await h.call("GET", "/api/ledger", { token: phone });
    expect(after.status).toBe(401);
    expect(after.json.error.code).toBe("session_revoked");

    // Supabase may still refresh the old session: a new token with the same session_id is refused.
    h.advance(60_000);
    const refreshed = await h.token("m_mumma", { sessionId: "mumma-phone", authTime: h.now() - 120_000 });
    expect((await h.call("GET", "/api/ledger", { token: refreshed })).status).toBe(401);
    // The other device is unaffected.
    expect((await h.call("GET", "/api/ledger", { token: ipad })).status).toBe(200);
  });

  it("a member cannot revoke another member's session directly", async () => {
    const h = await makeHarness();
    const papa = await h.token("m_papa", { sessionId: "papa-phone" });
    const mumma = await h.token("m_mumma", { sessionId: "mumma-phone" });
    await h.call("GET", "/api/ledger", { token: papa });
    const res = await h.call("POST", "/api/security/sessions/papa-phone/revoke", { token: mumma });
    expect(res.status).toBe(403);
    expect((await h.call("GET", "/api/ledger", { token: papa })).status).toBe(200);
  });

  it("sign out everywhere needs fresh authentication and kills every existing session", async () => {
    const h = await makeHarness();
    const signInTime = h.now();
    const a = await h.token("m_papa", { sessionId: "papa-a", authTime: signInTime });
    const b = await h.token("m_papa", { sessionId: "papa-b", authTime: signInTime });
    await h.call("GET", "/api/ledger", { token: a });
    await h.call("GET", "/api/ledger", { token: b });

    h.advance(10 * 60_000); // 10 minutes later: no longer "fresh"
    const stale = await h.token("m_papa", { sessionId: "papa-a", authTime: signInTime });
    const res = await h.call("POST", "/api/security/revoke-all", { token: stale });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("reauth_required");

    // Face ID again → fresh token on a new session
    const fresh = await h.token("m_papa", { sessionId: "papa-c", authTime: h.now() });
    expect((await h.call("POST", "/api/security/revoke-all", { token: fresh })).status).toBe(200);
    expect(h.providerCalls).toContain("signout-global");
    for (const t of [stale, b, fresh]) {
      expect((await h.call("GET", "/api/ledger", { token: t })).status).toBe(401);
    }
    // Signing in again afterwards works.
    h.advance(1000);
    const again = await h.token("m_papa", { sessionId: "papa-d", authTime: h.now() });
    expect((await h.call("GET", "/api/ledger", { token: again })).status).toBe(200);
  });

  it("enforces the inactivity timeout and maximum session age on the server", async () => {
    const h = await makeHarness();
    const t = await h.token("m_me", { sessionId: "me-1", exp: Math.floor(h.now() / 1000) + 48 * 3600 });
    expect((await h.call("GET", "/api/ledger", { token: t })).status).toBe(200);
    h.advance(61 * 60_000);
    expect((await h.call("GET", "/api/ledger", { token: t })).json.error.code).toBe("session_revoked");

    const t2 = await h.token("m_me", {
      sessionId: "me-2",
      authTime: h.now(),
      exp: Math.floor(h.now() / 1000) + 48 * 3600,
    });
    // Stay active (each request within the idle timeout) until the 12-hour maximum age passes.
    for (let i = 0; i < 14; i++) {
      expect((await h.call("GET", "/api/session", { token: t2 })).status, `after ${i * 59} min`).toBe(
        i * 59 <= 720 ? 200 : 401,
      );
      h.advance(59 * 60_000);
    }
  });

  it("refuses an old, never-seen session token", async () => {
    const h = await makeHarness();
    const t = await h.token("m_me", {
      sessionId: "ancient",
      authTime: h.now() - 13 * 3600_000,
      exp: Math.floor(h.now() / 1000) + 600,
    });
    expect((await h.call("GET", "/api/ledger", { token: t })).status).toBe(401);
  });

  it("lists devices for all members and marks the current one; sign-out revokes the current session", async () => {
    const h = await makeHarness();
    const me = await h.token("m_me", { sessionId: "me-laptop" });
    const mumma = await h.token("m_mumma", { sessionId: "mumma-phone" });
    await h.call("GET", "/api/ledger", {
      token: mumma,
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1" },
    });
    const res = await h.call("GET", "/api/security", { token: me });
    expect(res.status).toBe(200);
    const sessions = res.json.sessions as Array<{ id: string; current: boolean; label: string }>;
    expect(sessions.find((s) => s.id === "me-laptop")?.current).toBe(true);
    expect(sessions.find((s) => s.id === "mumma-phone")?.label).toBe("iPhone · Safari");
    expect((await h.call("POST", "/api/session/sign-out", { token: me })).status).toBe(200);
    expect((await h.call("GET", "/api/ledger", { token: me })).status).toBe(401);
  });
});

describe("emergency pause for a stolen device", () => {
  it("needs two other members, cannot be blocked by the target, and pauses all sessions", async () => {
    const h = await makeHarness();
    const papa = await h.token("m_papa", { sessionId: "papa-stolen-phone" });
    const mumma = await h.token("m_mumma", { sessionId: "mumma-1" });
    const me = await h.token("m_me", { sessionId: "me-1" });
    for (const t of [papa, mumma, me]) await h.call("GET", "/api/ledger", { token: t });

    const created = await h.call("POST", "/api/security/emergency", {
      token: mumma,
      body: { kind: "lock", targetMemberId: "m_papa", reason: "Papa's phone was stolen" },
    });
    expect(created.status).toBe(200);
    const id = created.json.id as string;
    expect(created.json.status).toBe("pending");
    // One member alone cannot lock someone out.
    expect((await h.call("GET", "/api/ledger", { token: papa })).status).toBe(200);

    // The target (or a thief with the phone) can't approve or cancel it.
    expect((await h.call("POST", `/api/security/emergency/${id}/approve`, { token: papa })).status).toBe(403);
    expect((await h.call("POST", `/api/security/emergency/${id}/cancel`, { token: papa })).status).toBe(403);
    // The requester can't approve twice.
    expect((await h.call("POST", `/api/security/emergency/${id}/approve`, { token: mumma })).status).toBe(400);

    const approved = await h.call("POST", `/api/security/emergency/${id}/approve`, { token: me });
    expect(approved.json.status).toBe("completed");
    expect(h.providerCalls).toContain("ban:22222222-2222-2222-2222-222222222222:true");

    const blocked = await h.call("GET", "/api/ledger", { token: papa });
    expect(blocked.status).toBe(403);
    expect(blocked.json.error.code).toBe("member_locked");
    // Even a brand-new sign-in is refused while paused.
    const newSignIn = await h.token("m_papa", { sessionId: "papa-new", authTime: h.now() });
    expect((await h.call("GET", "/api/ledger", { token: newSignIn })).json.error.code).toBe("member_locked");

    // Unpausing also needs two members; afterwards old sessions stay dead and a fresh sign-in works.
    const unlock = await h.call("POST", "/api/security/emergency", {
      token: me,
      body: { kind: "unlock", targetMemberId: "m_papa", reason: "Papa has a new phone" },
    });
    await h.call("POST", `/api/security/emergency/${unlock.json.id}/approve`, { token: mumma });
    expect((await h.call("GET", "/api/ledger", { token: papa })).status).not.toBe(200);
    h.advance(5000);
    const fresh = await h.token("m_papa", { sessionId: "papa-replacement", authTime: h.now() });
    expect((await h.call("GET", "/api/ledger", { token: fresh })).status).toBe(200);

    // Security actions are in the audit trail.
    const audit = await h.call("GET", "/api/audit?q=paused", { token: me });
    expect(audit.json.entries.some((e: { summary: string }) => e.summary.includes("Papa's account was paused"))).toBe(
      true,
    );
  });

  it("does not allow pausing yourself or requests by non-fresh sessions", async () => {
    const h = await makeHarness();
    const mumma = await h.token("m_mumma", { sessionId: "m1" });
    await h.call("GET", "/api/ledger", { token: mumma });
    const self = await h.call("POST", "/api/security/emergency", {
      token: mumma,
      body: { kind: "lock", targetMemberId: "m_mumma", reason: "x" },
    });
    expect(self.status).toBe(400);
    h.advance(10 * 60_000);
    const stale = await h.call("POST", "/api/security/emergency", {
      token: mumma,
      body: { kind: "lock", targetMemberId: "m_papa", reason: "x" },
    });
    expect(stale.json.error.code).toBe("reauth_required");
  });
});
