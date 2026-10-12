import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

type Decision = "static" | "navigate" | "bypass";
type DecideFn = (
  req: { method: string; url: string; mode?: string; headers?: { has(n: string): boolean } },
  ctx: { origin: string; scopePath: string },
) => Decision;

let decide: DecideFn;
const listeners: Record<string, unknown> = {};

beforeAll(() => {
  const code = readFileSync(join(__dirname, "..", "public", "sw.js"), "utf8");
  const fakeSelf: Record<string, unknown> = {
    addEventListener: (type: string, fn: unknown) => {
      listeners[type] = fn;
    },
    location: { href: "https://family.example.org/ledger/sw.js" },
  };
  new Function("self", "caches", "fetch", code)(fakeSelf, {}, () => undefined);
  decide = fakeSelf.familyLedgerCacheDecision as DecideFn;
});

const ctx = { origin: "https://family.example.org", scopePath: "/ledger/" };
const headers = (auth = false) => ({ has: (n: string) => auth && n.toLowerCase() === "authorization" });
const get = (url: string, extra: Partial<{ mode: string; auth: boolean; method: string }> = {}) =>
  decide({ method: extra.method ?? "GET", url, mode: extra.mode, headers: headers(extra.auth) }, ctx);

describe("service worker cache policy", () => {
  it("registers install, activate and fetch handlers", () => {
    expect(Object.keys(listeners).sort()).toEqual(["activate", "fetch", "install"]);
  });

  it("caches hashed assets, icons, manifest and the offline page", () => {
    expect(get("https://family.example.org/ledger/assets/index-abc123.js")).toBe("static");
    expect(get("https://family.example.org/ledger/icons/icon-192.png")).toBe("static");
    expect(get("https://family.example.org/ledger/manifest.webmanifest")).toBe("static");
    expect(get("https://family.example.org/ledger/offline.html")).toBe("static");
  });

  it("never caches API requests", () => {
    expect(get("https://family.example.org/ledger/api/ledger")).toBe("bypass");
    expect(get("https://family.example.org/api/ledger")).toBe("bypass");
    expect(get("https://family.example.org/ledger/api/ledger", { mode: "navigate" })).toBe("bypass");
  });

  it("never caches cross-origin requests (API worker, Supabase)", () => {
    expect(get("https://api.example.com/api/ledger")).toBe("bypass");
    expect(get("https://abc.supabase.co/auth/v1/token")).toBe("bypass");
    expect(get("https://cdn.example.com/ledger/assets/x.js")).toBe("bypass");
  });

  it("never caches requests carrying an Authorization header", () => {
    expect(get("https://family.example.org/ledger/assets/index-abc123.js", { auth: true })).toBe("bypass");
  });

  it("ignores non-GET requests and paths outside the app scope", () => {
    expect(get("https://family.example.org/ledger/assets/a.js", { method: "POST" })).toBe("bypass");
    expect(get("https://family.example.org/other/assets/a.js")).toBe("bypass");
    expect(get("https://family.example.org/ledger/assets/a.js?x=1")).toBe("bypass");
    expect(get("https://family.example.org/ledger/random.json")).toBe("bypass");
  });

  it("treats page navigations as network-first with an offline fallback", () => {
    expect(get("https://family.example.org/ledger/accounts/acc_1", { mode: "navigate" })).toBe("navigate");
  });
});
