/**
 * Build-time safety checks for the web app. Pure functions so they can be
 * unit tested without running Vite.
 */

export type AppMode = "demo" | "connected";

export interface GuardInput {
  /** Vite mode (from --mode). "demo" selects demo; anything else is connected unless VITE_APP_MODE says otherwise. */
  mode: string;
  /** "build" or "serve" (vite dev). Preview and tests are skipped by the caller. */
  command: "build" | "serve";
  env: Record<string, string | undefined>;
}

export interface GuardResult {
  appMode: AppMode;
  basePath: string;
  apiOrigin?: string;
  supabaseOrigin?: string;
  errors: string[];
}

export function resolveAppMode(mode: string, env: Record<string, string | undefined>): AppMode {
  const explicit = env.VITE_APP_MODE?.trim();
  if (explicit === "demo" || explicit === "connected") return explicit;
  return mode === "demo" ? "demo" : "connected";
}

export function normaliseBasePath(raw: string | undefined): string {
  let base = (raw ?? "/").trim() || "/";
  if (!base.startsWith("/")) base = `/${base}`;
  if (!base.endsWith("/")) base = `${base}/`;
  return base;
}

function isLocalhost(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}

function checkUrl(
  name: string,
  raw: string | undefined,
  command: "build" | "serve",
  errors: string[],
): string | undefined {
  if (!raw || !raw.trim()) {
    errors.push(`${name} is required for a connected build.`);
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    errors.push(`${name} must be a full URL (got something that isn't a URL).`);
    return undefined;
  }
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && isLocalhost(url) && command === "serve") return url.origin;
  errors.push(
    command === "serve"
      ? `${name} must use https:// (http://localhost is allowed only for vite dev).`
      : `${name} must use https:// in a build (http://localhost is allowed only for vite dev).`,
  );
  return undefined;
}

export function validateBuildEnv(input: GuardInput): GuardResult {
  const { env, command } = input;
  const appMode = resolveAppMode(input.mode, env);
  const errors: string[] = [];
  const result: GuardResult = { appMode, basePath: normaliseBasePath(env.VITE_BASE_PATH), errors };

  if (appMode === "demo") {
    if (env.VITE_API_BASE_URL && env.VITE_API_BASE_URL.trim()) {
      errors.push("VITE_API_BASE_URL must not be set for a demo build — the demo must never point at a real API.");
    }
    return result;
  }

  result.apiOrigin = checkUrl("VITE_API_BASE_URL", env.VITE_API_BASE_URL, command, errors);
  result.supabaseOrigin = checkUrl("VITE_SUPABASE_URL", env.VITE_SUPABASE_URL, command, errors);
  if (!env.VITE_SUPABASE_PUBLISHABLE_KEY || !env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()) {
    errors.push("VITE_SUPABASE_PUBLISHABLE_KEY is required for a connected build.");
  }
  return result;
}

/** Strict Content-Security-Policy for GitHub Pages (delivered as a <meta> tag). */
export function buildCsp(origins: { apiOrigin?: string; supabaseOrigin?: string }): string {
  const connect = ["'self'", origins.apiOrigin, origins.supabaseOrigin].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connect}`,
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
