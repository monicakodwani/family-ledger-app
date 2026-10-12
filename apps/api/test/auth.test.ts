import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { SUPABASE_URL, makeHarness } from "./harness";

describe("authentication enforcement", () => {
  it("allows the health check without auth but nothing else", async () => {
    const h = await makeHarness();
    expect((await h.call("GET", "/api/health")).status).toBe(200);
    for (const [m, p] of [
      ["GET", "/api/ledger"],
      ["GET", "/api/session"],
      ["POST", "/api/commands"],
      ["GET", "/api/audit"],
      ["GET", "/api/security"],
      ["GET", "/api/export"],
      ["POST", "/api/accounts/acc_fd/reveal"],
    ] as const) {
      const res = await h.call(m, p, { body: m === "POST" ? {} : undefined });
      expect(res.status, `${m} ${p}`).toBe(401);
      expect(res.json.error.code).toBe("unauthenticated");
      expect(JSON.stringify(res.json)).not.toMatch(/acc_|Rohit|stack|Error:/);
    }
  });

  it("rejects malformed, forged, expired, wrong-issuer and wrong-audience tokens", async () => {
    const h = await makeHarness();
    const bad = [
      "not-a-jwt",
      await h.token("m_mumma", { issuer: "https://evil.supabase.co/auth/v1" }),
      await h.token("m_mumma", { audience: "anon" }),
      await h.token("m_mumma", { iat: h.now() - 7200_000, exp: Math.floor(h.now() / 1000) - 600 }),
      await new SignJWT({ role: "authenticated", session_id: "s", amr: [{ method: "otp", timestamp: 1 }] })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("x")
        .setIssuer(`${SUPABASE_URL}/auth/v1`)
        .setAudience("authenticated")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode("a-shared-secret-that-should-not-work-0123456789")),
    ];
    for (const t of bad) {
      const res = await h.call("GET", "/api/ledger", { token: t });
      expect(res.status).toBe(401);
    }
  });

  it("rejects anonymous users and tokens without a sign-in time", async () => {
    const h = await makeHarness();
    const anon = await h.token("m_mumma", { extra: { is_anonymous: true } });
    expect((await h.call("GET", "/api/ledger", { token: anon })).status).toBe(401);
    const noAmr = await h.token("m_mumma", { extra: { amr: undefined } });
    expect((await h.call("GET", "/api/ledger", { token: noAmr })).status).toBe(401);
  });

  it("rejects valid identities that are not family members", async () => {
    const h = await makeHarness();
    const stranger = await h.token("m_stranger");
    const res = await h.call("GET", "/api/ledger", { token: stranger });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("not_a_member");
  });

  it("refuses a second identity claiming an already-bound member email", async () => {
    const h = await makeHarness();
    expect((await h.call("GET", "/api/session", { token: await h.token("m_mumma") })).status).toBe(200);
    // A different provider user id presenting Mumma's email (e.g. an account recreated by someone else)
    const imposter = await h.token("m_stranger", { extra: { email: "mumma@example.com" } });
    expect((await h.call("GET", "/api/session", { token: imposter })).json.error.code).toBe("not_a_member");
  });

  it("enforces CORS origin allowlist and preflight", async () => {
    const h = await makeHarness();
    const t = await h.token("m_mumma");
    const evil = await h.call("GET", "/api/ledger", { token: t, origin: "https://evil.example.com" });
    expect(evil.status).toBe(403);
    expect(evil.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const pre = await h.call("OPTIONS", "/api/commands");
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBe("https://family.example.org");
    expect(pre.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  it("sends no-store and security headers on every response, including errors", async () => {
    const h = await makeHarness();
    const t = await h.token("m_mumma");
    for (const res of [
      await h.call("GET", "/api/ledger", { token: t }),
      await h.call("GET", "/api/ledger"),
      await h.call("GET", "/api/nope", { token: t }),
    ]) {
      expect(res.headers.get("Cache-Control")).toContain("no-store");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    }
  });

  it("requires JSON content type for writes (CSRF defence)", async () => {
    const h = await makeHarness();
    const t = await h.token("m_mumma");
    const res = await h.app.fetch(
      new Request("https://api.example.org/api/commands", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "text/plain", Origin: "https://family.example.org" },
        body: JSON.stringify({ command: { type: "check.create", title: "x" } }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rate limits repeated failed authentication from one address", async () => {
    const h = await makeHarness();
    let last = 0;
    for (let i = 0; i < 35; i++) {
      last = (
        await h.call("GET", "/api/ledger", {
          token: "garbage.token.value",
          headers: { "CF-Connecting-IP": "203.0.113.9" },
        })
      ).status;
    }
    expect(last).toBe(429);
  });
});
