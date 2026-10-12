import { generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appManifest,
  familyMembers,
  githubAppJwt,
  parsePagesUrl,
  passkeyPatch,
  pickSupabaseKeys,
  toPkcs8,
  workerConfig,
  workersDevUrl,
} from "../../../scripts/setup-lib.mjs";
import { parseConfig } from "../src/config";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pkcs1 = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

describe("setup helpers", () => {
  it("converts GitHub's PKCS#1 key to PKCS#8 and signs a verifiable app JWT", () => {
    const pkcs8 = toPkcs8(pkcs1);
    expect(pkcs8).toContain("BEGIN PRIVATE KEY");
    const jwt = githubAppJwt(12345, pkcs8, 1_700_000_000);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(p, "base64url").toString())).toEqual({
      iat: 1_699_999_940,
      exp: 1_700_000_540,
      iss: "12345",
    });
    expect(
      verify("RSA-SHA256", Buffer.from(`${h}.${p}`), createPublicKey(privateKey), Buffer.from(s, "base64url")),
    ).toBe(true);
  });

  it("derives https origin and base path from the Pages URL", () => {
    expect(parsePagesUrl("http://monicakodwani.com/family-ledger-app/")).toEqual({
      origin: "https://monicakodwani.com",
      host: "monicakodwani.com",
      basePath: "/family-ledger-app/",
      siteUrl: "https://monicakodwani.com/family-ledger-app/",
    });
  });

  it("produces a Worker config and member list the API accepts", () => {
    const members = familyMembers([
      { name: "Neeta", email: " Neeta@Example.com " },
      { name: "Chandra", email: "c@example.com" },
      { name: "Monica", email: "m@example.com" },
    ]);
    expect(members[0]).toEqual({ id: "m_mumma", displayName: "Neeta", email: "neeta@example.com" });
    const cfg = workerConfig({
      origin: "https://monicakodwani.com",
      supabaseUrl: "https://abc.supabase.co",
      owner: "o",
      appId: 1,
      installationId: 2,
    });
    expect(() => parseConfig({ ...cfg.vars, FAMILY_MEMBERS: JSON.stringify(members) })).not.toThrow();
  });

  it("asks GitHub for contents write only, no webhook", () => {
    const m = appManifest({
      owner: "monicakodwani",
      siteUrl: "https://x/",
      redirectUrl: "http://127.0.0.1:8123/callback",
    });
    expect(m.default_permissions).toEqual({ contents: "write", metadata: "read" });
    expect(m.hook_attributes.active).toBe(false);
    expect(m.public).toBe(false);
  });

  it("only sets passkey fields the project already has", () => {
    expect(passkeyPatch({ site_url: "x", disable_signup: false }, { host: "h", origin: "https://h" })).toEqual({});
    expect(
      passkeyPatch(
        { passkey_enabled: false, passkey_rp_id: "", passkey_rp_origins: [], passkey_rp_display_name: "" },
        { host: "monicakodwani.com", origin: "https://monicakodwani.com" },
      ),
    ).toEqual({
      passkey_enabled: true,
      passkey_rp_id: "monicakodwani.com",
      passkey_rp_origins: ["https://monicakodwani.com"],
      passkey_rp_display_name: "Family Ledger",
    });
  });

  it("picks the right Supabase keys in old and new formats", () => {
    expect(
      pickSupabaseKeys([
        { name: "anon", api_key: "a" },
        { name: "service_role", api_key: "s" },
      ]),
    ).toEqual({ publishable: "a", secret: "s" });
    expect(
      pickSupabaseKeys([
        { name: "default", type: "publishable", api_key: "sb_publishable_x" },
        { name: "default", type: "secret", api_key: "sb_secret_y" },
      ]),
    ).toEqual({ publishable: "sb_publishable_x", secret: "sb_secret_y" });
  });

  it("finds the workers.dev URL in deploy output", () => {
    expect(workersDevUrl("Deployed family-ledger-api triggers\n  https://family-ledger-api.monica.workers.dev\n")).toBe(
      "https://family-ledger-api.monica.workers.dev",
    );
  });
});
