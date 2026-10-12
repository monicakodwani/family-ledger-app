import { describe, expect, it } from "vitest";
import { buildCsp, normaliseBasePath, resolveAppMode, validateBuildEnv } from "./envGuard";

const good = {
  VITE_API_BASE_URL: "https://api.example.com",
  VITE_SUPABASE_URL: "https://abc.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
};

describe("build env guard", () => {
  it("resolves the app mode from --mode or VITE_APP_MODE", () => {
    expect(resolveAppMode("demo", {})).toBe("demo");
    expect(resolveAppMode("connected", {})).toBe("connected");
    expect(resolveAppMode("production", {})).toBe("connected");
    expect(resolveAppMode("production", { VITE_APP_MODE: "demo" })).toBe("demo");
  });

  it("accepts a complete https connected build", () => {
    const r = validateBuildEnv({ mode: "connected", command: "build", env: good });
    expect(r.errors).toEqual([]);
    expect(r.apiOrigin).toBe("https://api.example.com");
    expect(r.supabaseOrigin).toBe("https://abc.supabase.co");
  });

  it("fails a connected build with missing variables", () => {
    const r = validateBuildEnv({ mode: "connected", command: "build", env: {} });
    expect(r.errors).toHaveLength(3);
  });

  it("rejects non-https API URLs in builds, allows http://localhost only in dev", () => {
    const local = { ...good, VITE_API_BASE_URL: "http://localhost:8787" };
    expect(validateBuildEnv({ mode: "connected", command: "build", env: local }).errors).toHaveLength(1);
    expect(validateBuildEnv({ mode: "connected", command: "serve", env: local }).errors).toEqual([]);
    const remoteHttp = { ...good, VITE_API_BASE_URL: "http://api.example.com" };
    expect(validateBuildEnv({ mode: "connected", command: "serve", env: remoteHttp }).errors).toHaveLength(1);
    expect(
      validateBuildEnv({ mode: "connected", command: "build", env: { ...good, VITE_API_BASE_URL: "not a url" } })
        .errors,
    ).toHaveLength(1);
  });

  it("fails a demo build that points at an API", () => {
    expect(validateBuildEnv({ mode: "demo", command: "build", env: {} }).errors).toEqual([]);
    expect(
      validateBuildEnv({ mode: "demo", command: "build", env: { VITE_API_BASE_URL: "https://api.example.com" } })
        .errors,
    ).toHaveLength(1);
  });

  it("normalises the base path", () => {
    expect(normaliseBasePath(undefined)).toBe("/");
    expect(normaliseBasePath("family-ledger")).toBe("/family-ledger/");
    expect(normaliseBasePath("/family-ledger/")).toBe("/family-ledger/");
  });

  it("builds a strict CSP with only the configured origins", () => {
    const csp = buildCsp({ apiOrigin: "https://api.example.com", supabaseOrigin: "https://abc.supabase.co" });
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self' https://api.example.com https://abc.supabase.co");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(buildCsp({})).toContain("connect-src 'self';");
  });
});
