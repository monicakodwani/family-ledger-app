import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { createApp } from "../src/app";
import { createSupabaseVerifier } from "../src/auth";
import type { AppConfig } from "../src/config";
import { MemoryKV, SecurityEngine } from "../src/security/engine";
import { LedgerService } from "../src/service";
import { MemoryLedgerStore } from "../src/storage/memory";
import type { ProviderAdmin } from "../src/provider-admin";

export const SUPABASE_URL = "https://testproject.supabase.co";
export const ORIGIN = "https://family.example.org";
export const API = "https://api.example.org";

export const MEMBERS = [
  { id: "m_mumma", displayName: "Mumma", email: "mumma@example.com" },
  { id: "m_papa", displayName: "Papa", email: "papa@example.com" },
  { id: "m_me", displayName: "Riya", email: "riya@example.com" },
];
export const USERS: Record<string, string> = {
  m_mumma: "11111111-1111-1111-1111-111111111111",
  m_papa: "22222222-2222-2222-2222-222222222222",
  m_me: "33333333-3333-3333-3333-333333333333",
};

export async function makeHarness(overrides: Partial<AppConfig> = {}) {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "ES256" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  let clock = Date.parse("2026-10-12T05:00:00.000Z");
  const store = new MemoryLedgerStore();
  const kv = new MemoryKV();
  const security = new SecurityEngine(kv);
  let idn = 0;
  const newId = () => `id-${++idn}`;
  const service = new LedgerService(store, {
    members: MEMBERS,
    seedStarterAccounts: true,
    now: () => new Date(clock),
    newId,
  });
  const providerCalls: string[] = [];
  const providerAdmin: ProviderAdmin = {
    async setBanned(id, banned) {
      providerCalls.push(`ban:${id}:${banned}`);
      return true;
    },
    async signOutEverywhere() {
      providerCalls.push("signout-global");
      return true;
    },
  };
  const config: AppConfig = {
    environment: "production",
    allowedOrigins: [ORIGIN],
    members: MEMBERS,
    idleTimeoutSeconds: 3600,
    sessionMaxAgeSeconds: 12 * 3600,
    freshAuthSeconds: 300,
    seedStarterAccounts: true,
    ...overrides,
  };
  const app = createApp({
    config,
    verifier: createSupabaseVerifier({ supabaseUrl: SUPABASE_URL, jwks, now: () => clock }),
    security,
    service,
    providerAdmin,
    now: () => clock,
    newId,
  });

  async function token(
    memberId: string,
    opts: {
      sessionId?: string;
      authTime?: number;
      iat?: number;
      exp?: number;
      extra?: Record<string, unknown>;
      alg?: string;
      issuer?: string;
      audience?: string;
    } = {},
  ) {
    const iat = Math.floor((opts.iat ?? clock) / 1000);
    const member = MEMBERS.find((m) => m.id === memberId);
    return new SignJWT({
      email: member?.email ?? `${memberId}@example.com`,
      role: "authenticated",
      session_id: opts.sessionId ?? `sess-${memberId}`,
      amr: [{ method: "webauthn", timestamp: Math.floor((opts.authTime ?? clock) / 1000) }],
      ...opts.extra,
    })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setSubject(USERS[memberId] ?? "99999999-9999-9999-9999-999999999999")
      .setIssuer(opts.issuer ?? `${SUPABASE_URL}/auth/v1`)
      .setAudience(opts.audience ?? "authenticated")
      .setIssuedAt(iat)
      .setExpirationTime(opts.exp ?? iat + 3600)
      .sign(privateKey);
  }

  async function call(
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; origin?: string | null; headers?: Record<string, string> } = {},
  ) {
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN;
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await app.fetch(
      new Request(`${API}${path}`, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      }),
    );
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  }

  return {
    app,
    store,
    security,
    service,
    providerCalls,
    token,
    call,
    advance: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
  };
}

export type Harness = Awaited<ReturnType<typeof makeHarness>>;
