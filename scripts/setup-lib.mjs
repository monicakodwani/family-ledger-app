/**
 * Pure helpers for scripts/setup.mjs (kept separate so they can be unit tested).
 * Node built-ins only.
 */
import { createPrivateKey, randomBytes, sign } from "node:crypto";

export const MEMBER_IDS = ["m_mumma", "m_papa", "m_me"];

export function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** GitHub App JWT (RS256), valid ~9 minutes. */
export function githubAppJwt(appId, pem, nowSec = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: nowSec - 60, exp: nowSec + 540, iss: String(appId) }));
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), createPrivateKey(pem));
  return `${header}.${payload}.${b64url(signature)}`;
}

/** GitHub gives PKCS#1 keys; the Worker's WebCrypto needs PKCS#8. */
export function toPkcs8(pem) {
  return createPrivateKey(pem).export({ type: "pkcs8", format: "pem" }).toString();
}

export function newDataKey() {
  return randomBytes(32).toString("base64");
}

/** "http://monicakodwani.com/family-ledger-app/" → origin, basePath, siteUrl (always https). */
export function parsePagesUrl(htmlUrl) {
  const u = new URL(htmlUrl);
  u.protocol = "https:";
  const basePath = u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
  return { origin: u.origin, host: u.hostname, basePath, siteUrl: `${u.origin}${basePath}` };
}

export function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function familyMembers(people) {
  return people.map((p, i) => ({ id: MEMBER_IDS[i], displayName: p.name, email: p.email.trim().toLowerCase() }));
}

/** GitHub App manifest: one repository permission, no webhook. */
export function appManifest({ owner, siteUrl, redirectUrl }) {
  return {
    name: `family-ledger-${owner}`.slice(0, 34),
    url: siteUrl,
    hook_attributes: { url: siteUrl, active: false },
    redirect_url: redirectUrl,
    public: false,
    default_permissions: { contents: "write", metadata: "read" },
    default_events: [],
  };
}

/** Full Worker config written to an untracked file, so personal values never enter git. */
export function workerConfig({ origin, supabaseUrl, owner, appId, installationId }) {
  return {
    name: "family-ledger-api",
    main: "src/index.ts",
    compatibility_date: "2025-09-01",
    workers_dev: true,
    observability: { enabled: true },
    durable_objects: { bindings: [{ name: "SECURITY", class_name: "SecurityDurableObject" }] },
    migrations: [{ tag: "v1", new_sqlite_classes: ["SecurityDurableObject"] }],
    vars: {
      ENVIRONMENT: "production",
      ALLOWED_ORIGINS: origin,
      SUPABASE_URL: supabaseUrl,
      STORAGE_BACKEND: "github",
      GITHUB_OWNER: owner,
      GITHUB_REPO: "family-ledger-private-data",
      GITHUB_BRANCH: "main",
      GITHUB_APP_ID: String(appId),
      GITHUB_APP_INSTALLATION_ID: String(installationId),
      DATA_ACTIVE_KEY_ID: "k1",
      IDLE_TIMEOUT_MINUTES: "60",
      SESSION_MAX_AGE_HOURS: "12",
      FRESH_AUTH_MINUTES: "5",
      SEED_STARTER_ACCOUNTS: "true",
    },
  };
}

/**
 * Supabase's passkey settings are beta and their API field names aren't
 * documented. Only touch fields that the project's own config already has.
 */
export function passkeyPatch(authConfig, { host, origin }) {
  const patch = {};
  for (const [key, value] of Object.entries(authConfig ?? {})) {
    if (!/passkey|webauthn/i.test(key)) continue;
    if (/enabled$/i.test(key) && typeof value === "boolean") patch[key] = true;
    else if (/rp_?id$/i.test(key)) patch[key] = host;
    else if (/origins?$/i.test(key)) patch[key] = Array.isArray(value) ? [origin] : origin;
    else if (/(display_?name|rp_?name)$/i.test(key)) patch[key] = "Family Ledger";
  }
  return patch;
}

export function pickSupabaseKeys(keys) {
  const find = (pred) => keys.find(pred)?.api_key;
  return {
    publishable: find((k) => k.type === "publishable") ?? find((k) => k.name === "anon"),
    secret: find((k) => k.name === "service_role") ?? find((k) => k.type === "secret"),
  };
}

export function workersDevUrl(output) {
  return output.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i)?.[0] ?? null;
}
