import { createApp } from "./app";
import { createSupabaseVerifier } from "./auth";
import { type Env, parseConfig } from "./config";
import { AesGcmCodec } from "./crypto";
import { HttpError, errorResponse, logEvent } from "./http";
import { createSupabaseAdmin } from "./provider-admin";
import { durableSecurityClient } from "./security/durable";
import { LedgerService } from "./service";
import { GitHubLedgerStore } from "./storage/github";
import { GitHubAppTokenProvider } from "./storage/github-app";
import { MemoryLedgerStore } from "./storage/memory";
import type { LedgerStore } from "./storage/types";

export { SecurityDurableObject } from "./security/durable";

let cached: { key: string; app: ReturnType<typeof createApp> } | null = null;

async function buildApp(env: Env) {
  const config = parseConfig(env);
  if (!env.SECURITY) throw new Error("SECURITY Durable Object binding missing");

  let store: LedgerStore;
  const backend = env.STORAGE_BACKEND ?? "github";
  if (backend === "memory") {
    // A disposable store for local `wrangler dev` only. Never in production.
    if (config.environment !== "development") throw new Error("Memory storage is only allowed in development");
    store = new MemoryLedgerStore();
  } else if (backend === "github") {
    for (const k of [
      "GITHUB_OWNER",
      "GITHUB_REPO",
      "GITHUB_APP_ID",
      "GITHUB_APP_INSTALLATION_ID",
      "GITHUB_APP_PRIVATE_KEY",
      "DATA_ENCRYPTION_KEYS",
      "DATA_ACTIVE_KEY_ID",
    ] as const) {
      if (!env[k]) throw new Error(`${k} is not configured`);
    }
    const codec = await AesGcmCodec.fromConfig(env.DATA_ENCRYPTION_KEYS!, env.DATA_ACTIVE_KEY_ID!);
    const tokens = new GitHubAppTokenProvider({
      appId: env.GITHUB_APP_ID!,
      installationId: env.GITHUB_APP_INSTALLATION_ID!,
      privateKeyPkcs8: env.GITHUB_APP_PRIVATE_KEY!,
      repo: env.GITHUB_REPO!,
    });
    store = new GitHubLedgerStore({
      owner: env.GITHUB_OWNER!,
      repo: env.GITHUB_REPO!,
      branch: env.GITHUB_BRANCH ?? "main",
      token: () => tokens.getToken(),
      codec,
    });
  } else {
    throw new Error("Unknown STORAGE_BACKEND");
  }

  return createApp({
    config,
    verifier: createSupabaseVerifier({ supabaseUrl: env.SUPABASE_URL! }),
    security: durableSecurityClient(env.SECURITY),
    service: new LedgerService(store, { members: config.members, seedStarterAccounts: config.seedStarterAccounts }),
    providerAdmin: env.SUPABASE_SERVICE_ROLE_KEY
      ? createSupabaseAdmin({ supabaseUrl: env.SUPABASE_URL!, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      : undefined,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // Rebuild if configuration changes between deployments (keyed on non-secret values).
      const key = [
        env.ENVIRONMENT,
        env.ALLOWED_ORIGINS,
        env.FAMILY_MEMBERS,
        env.GITHUB_REPO,
        env.DATA_ACTIVE_KEY_ID,
      ].join("|");
      if (!cached || cached.key !== key) cached = { key, app: await buildApp(env) };
      return await cached.app.fetch(request);
    } catch (e) {
      // Fail closed on configuration errors without revealing details.
      logEvent({
        requestId: crypto.randomUUID(),
        route: "startup",
        status: 503,
        code: "config",
        reason: e instanceof Error ? e.message.slice(0, 120) : "unknown",
      });
      return errorResponse(new HttpError("unavailable"));
    }
  },
};
