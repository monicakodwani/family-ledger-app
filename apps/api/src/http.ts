import { type ApiErrorCode, FRIENDLY_ERRORS } from "@family-ledger/shared";

export const STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  session_revoked: 401,
  member_locked: 403,
  not_a_member: 403,
  reauth_required: 403,
  forbidden: 403,
  not_found: 404,
  version_conflict: 409,
  invalid: 400,
  rate_limited: 429,
  storage_busy: 503,
  unavailable: 503,
  internal: 500,
};

export class HttpError extends Error {
  constructor(
    public code: ApiErrorCode,
    public friendly: string = FRIENDLY_ERRORS[code],
    public current?: unknown,
    public retryAfter?: number,
  ) {
    super(code);
    this.name = "HttpError";
  }
}

/**
 * Headers on every API response. `no-store` prevents browsers, proxies and
 * service workers from keeping financial responses.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Expose-Headers": "Content-Disposition, Retry-After",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extra },
  });
}

export function errorResponse(err: HttpError, extra: Record<string, string> = {}): Response {
  const headers = { ...extra };
  if (err.retryAfter) headers["Retry-After"] = String(err.retryAfter);
  return json(
    { error: { code: err.code, message: err.friendly, ...(err.current ? { current: err.current } : {}) } },
    STATUS[err.code],
    headers,
  );
}

const MAX_BODY_BYTES = 64 * 1024;

/** Reads a JSON body, enforcing content type and size. */
export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get("Content-Type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) throw new HttpError("invalid");
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > MAX_BODY_BYTES) throw new HttpError("invalid");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError("invalid");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError("invalid");
  }
}

/**
 * Structured logs with an explicit allowlist of fields. Never pass tokens,
 * request bodies, emails, or financial data here.
 */
export function logEvent(fields: {
  requestId: string;
  route: string;
  status: number;
  code?: string;
  reason?: string;
  ms?: number;
}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...fields }));
}
