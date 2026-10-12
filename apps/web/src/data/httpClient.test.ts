import { describe, expect, it, vi } from "vitest";
import { FRIENDLY_ERRORS, LedgerClientError } from "@family-ledger/shared";
import { HttpLedgerClient } from "./httpClient";

function client(response: () => Promise<Response> | Response, token: string | null = "tok") {
  const fetchImpl = vi.fn(async () => response());
  const c = new HttpLedgerClient({ baseUrl: "https://api.example.com/", getAccessToken: async () => token, fetchImpl });
  return { c, fetchImpl };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("HttpLedgerClient", () => {
  it("sends the bearer token, never caches and never sends cookies", async () => {
    const { c, fetchImpl } = client(() => json(200, { ledger: {}, revision: 1 }));
    await c.getLedger();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/api/ledger");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("omit");
  });

  it("maps error bodies to friendly errors, keeping version-conflict data", async () => {
    const { c } = client(() =>
      json(409, { error: { code: "version_conflict", message: "stack trace here", current: { version: 3 } } }),
    );
    const err = (await c
      .sendCommand({ type: "check.create", title: "x" })
      .catch((e: unknown) => e)) as LedgerClientError;
    expect(err.code).toBe("version_conflict");
    expect(err.message).toBe(FRIENDLY_ERRORS.version_conflict);
    expect(err.current).toEqual({ version: 3 });
  });

  it("never surfaces technical errors", async () => {
    const { c } = client(() => new Response("<html>502 Bad Gateway nginx</html>", { status: 502 }));
    const err = (await c.getLedger().catch((e: unknown) => e)) as LedgerClientError;
    expect(err.message).toBe(FRIENDLY_ERRORS.internal);
    const { c: offline } = client(() => Promise.reject(new TypeError("Failed to fetch")));
    const err2 = (await offline.getLedger().catch((e: unknown) => e)) as LedgerClientError;
    expect(err2.code).toBe("unavailable");
  });

  it("ends the local session on revoked / locked / unauthenticated", async () => {
    for (const code of ["session_revoked", "member_locked", "unauthenticated"] as const) {
      const { c } = client(() => json(401, { error: { code, message: "x" } }));
      const ended = vi.fn();
      c.setSessionEndedHandler(ended);
      await c.getSession().catch(() => undefined);
      expect(ended).toHaveBeenCalledWith(code);
    }
  });

  it("does not call the API without a token", async () => {
    const { c, fetchImpl } = client(() => json(200, {}), null);
    const ended = vi.fn();
    c.setSessionEndedHandler(ended);
    await expect(c.getLedger()).rejects.toBeInstanceOf(LedgerClientError);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledWith("unauthenticated");
  });

  it("builds audit query strings", async () => {
    const { c, fetchImpl } = client(() => json(200, { entries: [], chainVerified: true }));
    await c.getAudit({ q: "fd renews", entityId: "acc_fd" });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://api.example.com/api/audit?q=fd+renews&entityId=acc_fd",
    );
  });
});
