import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config";
import { authTimeFromAmr, bearerToken, deviceLabel } from "../src/auth";

const base = {
  ENVIRONMENT: "production",
  ALLOWED_ORIGINS: "https://family.example.org",
  SUPABASE_URL: "https://x.supabase.co",
  FAMILY_MEMBERS: JSON.stringify([{ id: "m_mumma", displayName: "Mumma", email: "m@example.com" }]),
};

describe("configuration fails closed", () => {
  it("accepts a valid production config with safe defaults", () => {
    const c = parseConfig(base);
    expect(c.idleTimeoutSeconds).toBe(3600);
    expect(c.freshAuthSeconds).toBe(300);
  });
  it.each([
    [{ ALLOWED_ORIGINS: "" }],
    [{ ALLOWED_ORIGINS: "http://family.example.org" }],
    [{ ALLOWED_ORIGINS: "http://localhost:5173" }],
    [{ ALLOWED_ORIGINS: "https://family.example.org/path" }],
    [{ ALLOWED_ORIGINS: "*" }],
    [{ SUPABASE_URL: "http://x.supabase.co" }],
    [{ FAMILY_MEMBERS: "not json" }],
    [{ FAMILY_MEMBERS: JSON.stringify([{ id: "admin", displayName: "x", email: "x@example.com" }]) }],
    [{ ENVIRONMENT: "demo" }],
    [{ IDLE_TIMEOUT_MINUTES: "0" }],
  ])("rejects %o", (override) => {
    expect(() => parseConfig({ ...base, ...override })).toThrow();
  });
  it("allows localhost origins only in development", () => {
    expect(() =>
      parseConfig({ ...base, ENVIRONMENT: "development", ALLOWED_ORIGINS: "http://localhost:5173" }),
    ).not.toThrow();
  });
});

describe("auth helpers", () => {
  it("extracts bearer tokens strictly", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerToken("bearer abc")).toBeNull();
    expect(bearerToken("Bearer abc def")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
  it("uses the most recent amr timestamp as the sign-in time", () => {
    expect(
      authTimeFromAmr([
        { method: "otp", timestamp: 100 },
        { method: "webauthn", timestamp: 200 },
      ]),
    ).toBe(200_000);
    expect(authTimeFromAmr(undefined)).toBeUndefined();
    expect(authTimeFromAmr([{ method: "otp" }])).toBeUndefined();
  });
  it("labels devices without storing the user agent", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Version/18.0 Mobile Safari/604.1",
      ),
    ).toBe("iPhone · Safari");
    expect(deviceLabel("Mozilla/5.0 (Macintosh) Chrome/130 Safari/537")).toBe("Mac · Chrome");
    expect(deviceLabel(null)).toBe("Unknown device");
  });
});
