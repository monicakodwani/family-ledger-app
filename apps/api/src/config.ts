import { z } from "zod";

export interface Env {
  ENVIRONMENT?: string;
  ALLOWED_ORIGINS?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  FAMILY_MEMBERS?: string;
  STORAGE_BACKEND?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  DATA_ENCRYPTION_KEYS?: string;
  DATA_ACTIVE_KEY_ID?: string;
  IDLE_TIMEOUT_MINUTES?: string;
  SESSION_MAX_AGE_HOURS?: string;
  FRESH_AUTH_MINUTES?: string;
  SEED_STARTER_ACCOUNTS?: string;
  SECURITY?: DurableObjectNamespace;
}

const MemberConfig = z
  .array(
    z.object({
      id: z.string().regex(/^m_[a-z0-9_]{1,30}$/),
      displayName: z.string().min(1).max(40),
      email: z.string().email(),
    }),
  )
  .min(1)
  .max(20);

export interface AppConfig {
  environment: "production" | "staging" | "development";
  allowedOrigins: string[];
  members: z.infer<typeof MemberConfig>;
  idleTimeoutSeconds: number;
  sessionMaxAgeSeconds: number;
  freshAuthSeconds: number;
  seedStarterAccounts: boolean;
}

const int = (v: string | undefined, def: number, min: number, max: number) => {
  const n = v === undefined ? def : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error("Invalid numeric configuration");
  return n;
};

/** Parse and validate configuration. Throws on anything unsafe: the Worker fails closed. */
export function parseConfig(env: Env): AppConfig {
  const environment = (env.ENVIRONMENT ?? "production") as AppConfig["environment"];
  if (!["production", "staging", "development"].includes(environment)) throw new Error("Invalid ENVIRONMENT");

  const allowedOrigins = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (allowedOrigins.length === 0) throw new Error("ALLOWED_ORIGINS is required");
  for (const origin of allowedOrigins) {
    const u = new URL(origin);
    if (u.origin !== origin) throw new Error("ALLOWED_ORIGINS entries must be bare origins");
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && environment === "development")) {
      throw new Error("ALLOWED_ORIGINS must be https outside development");
    }
  }

  let members: AppConfig["members"];
  try {
    members = MemberConfig.parse(JSON.parse(env.FAMILY_MEMBERS ?? "[]"));
  } catch {
    throw new Error("FAMILY_MEMBERS must be a JSON array of {id, displayName, email}");
  }
  if (new Set(members.map((m) => m.id)).size !== members.length) throw new Error("Duplicate member ids");

  if (!env.SUPABASE_URL || !/^https:\/\//.test(env.SUPABASE_URL)) throw new Error("SUPABASE_URL must be https");

  return {
    environment,
    allowedOrigins,
    members,
    idleTimeoutSeconds: int(env.IDLE_TIMEOUT_MINUTES, 60, 5, 24 * 60) * 60,
    sessionMaxAgeSeconds: int(env.SESSION_MAX_AGE_HOURS, 12, 1, 24 * 30) * 3600,
    freshAuthSeconds: int(env.FRESH_AUTH_MINUTES, 5, 1, 60) * 60,
    seedStarterAccounts: (env.SEED_STARTER_ACCOUNTS ?? "true") === "true",
  };
}
