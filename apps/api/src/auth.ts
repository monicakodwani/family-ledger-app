import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify, errors as joseErrors } from "jose";

export interface VerifiedClaims {
  sub: string;
  email?: string;
  sessionId: string;
  /** When the user actually authenticated (Face ID / passkey / email link), from the amr claim. */
  authTimeMs: number;
  issuedAtMs: number;
  expiresAtMs: number;
}

export type TokenVerifier = (token: string) => Promise<VerifiedClaims>;

export class AuthError extends Error {
  constructor(public reason: string) {
    super("Authentication failed");
    this.name = "AuthError";
  }
}

interface SupabaseClaims {
  sub?: unknown;
  email?: unknown;
  session_id?: unknown;
  amr?: unknown;
  aud?: unknown;
  role?: unknown;
  is_anonymous?: unknown;
  iat?: number;
  exp?: number;
}

/**
 * Verifies Supabase access tokens against the project's JWKS. Only
 * asymmetric algorithms are accepted (configure "JWT signing keys" in
 * Supabase); the legacy shared HS256 secret is refused so the Worker never
 * needs a secret capable of minting tokens.
 */
export function createSupabaseVerifier(opts: {
  supabaseUrl: string;
  jwks?: JWTVerifyGetKey;
  clockToleranceSec?: number;
  now?: () => number;
}): TokenVerifier {
  const base = opts.supabaseUrl.replace(/\/$/, "");
  const issuer = `${base}/auth/v1`;
  const jwks =
    opts.jwks ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { cooldownDuration: 60_000 });

  return async (token: string) => {
    if (!token || token.length > 8192) throw new AuthError("malformed");
    let payload: SupabaseClaims;
    try {
      ({ payload } = (await jwtVerify(token, jwks, {
        issuer,
        audience: "authenticated",
        algorithms: ["ES256", "RS256", "EdDSA"],
        clockTolerance: opts.clockToleranceSec ?? 30,
        currentDate: opts.now ? new Date(opts.now()) : undefined,
        requiredClaims: ["sub", "exp", "iat"],
      })) as unknown as { payload: SupabaseClaims });
    } catch (e) {
      if (e instanceof joseErrors.JWTExpired) throw new AuthError("expired");
      throw new AuthError("invalid_token");
    }
    if (typeof payload.sub !== "string" || !payload.sub) throw new AuthError("no_sub");
    if (payload.role !== "authenticated" || payload.is_anonymous === true)
      throw new AuthError("not_authenticated_role");
    if (typeof payload.session_id !== "string" || !payload.session_id) throw new AuthError("no_session");
    const authTimeMs = authTimeFromAmr(payload.amr);
    // Fail closed: without a sign-in time we cannot enforce "revoke everywhere" or fresh-auth.
    if (authTimeMs === undefined) throw new AuthError("no_amr");
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      sessionId: payload.session_id,
      authTimeMs,
      issuedAtMs: (payload.iat ?? 0) * 1000,
      expiresAtMs: (payload.exp ?? 0) * 1000,
    };
  };
}

export function authTimeFromAmr(amr: unknown): number | undefined {
  if (!Array.isArray(amr)) return undefined;
  let max: number | undefined;
  for (const entry of amr) {
    const ts = (entry as { timestamp?: unknown })?.timestamp;
    if (typeof ts === "number" && Number.isFinite(ts) && ts > 0) max = Math.max(max ?? 0, ts * 1000);
  }
  return max;
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(header.trim());
  return m ? m[1]! : null;
}

/** A short, non-identifying device label from the User-Agent. The raw UA is never stored. */
export function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android phone"
        : /Macintosh|Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows computer"
            : /Linux/.test(ua)
              ? "Linux computer"
              : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /CriOS|Chrome\//.test(ua)
      ? "Chrome"
      : /FxiOS|Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "browser";
  return `${device} · ${browser}`;
}
