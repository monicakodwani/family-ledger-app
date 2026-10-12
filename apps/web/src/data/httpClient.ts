/**
 * HttpLedgerClient — talks to the Family Ledger API (Cloudflare Worker).
 * Every request carries the Supabase access token, is never cached, and never
 * sends cookies. Error bodies are mapped to friendly LedgerClientErrors.
 */
import {
  ApiErrorCode,
  FRIENDLY_ERRORS,
  LedgerClientError,
  type ApiErrorBody,
  type AuditPage,
  type Command,
  type CommandResponse,
  type EmergencyRequest,
  type LedgerResponse,
  type RevealResponse,
  type SecurityOverview,
  type SessionInfo,
  type SnapshotMeta,
} from "@family-ledger/shared";
import { SESSION_ENDING_CODES, type AppClient, type SessionEndCode } from "./types";

export interface HttpClientOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

function statusToCode(status: number): ApiErrorCode {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "version_conflict";
  if (status === 400 || status === 422) return "invalid";
  if (status === 429) return "rate_limited";
  if (status === 503) return "unavailable";
  return "internal";
}

/** Turn any error response into a friendly error. Never exposes technical text. */
export function toClientError(status: number, body: unknown): LedgerClientError {
  const parsed = ApiErrorCode.safeParse((body as Partial<ApiErrorBody> | null)?.error?.code);
  const code: ApiErrorCode = parsed.success ? parsed.data : statusToCode(status);
  const current = (body as Partial<ApiErrorBody> | null)?.error?.current;
  return new LedgerClientError(code, FRIENDLY_ERRORS[code], current);
}

export class HttpLedgerClient implements AppClient {
  readonly mode = "connected" as const;
  private readonly baseUrl: string;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly fetchImpl: typeof fetch;
  private sessionEndedHandler: ((code: SessionEndCode) => void) | null = null;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  setSessionEndedHandler(handler: ((code: SessionEndCode) => void) | null) {
    this.sessionEndedHandler = handler;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    as: "json" | "blob" = "json",
  ): Promise<T> {
    const token = await this.getAccessToken();
    if (!token) {
      this.sessionEndedHandler?.("unauthenticated");
      throw new LedgerClientError("unauthenticated", FRIENDLY_ERRORS.unauthenticated);
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: as === "json" ? "application/json" : "*/*",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
      });
    } catch {
      throw new LedgerClientError("unavailable", FRIENDLY_ERRORS.unavailable);
    }

    if (!res.ok) {
      let errBody: unknown = null;
      try {
        errBody = await res.json();
      } catch {
        errBody = null;
      }
      const error = toClientError(res.status, errBody);
      if (SESSION_ENDING_CODES.has(error.code)) this.sessionEndedHandler?.(error.code as SessionEndCode);
      throw error;
    }
    if (as === "blob") return (await res.blob()) as T;
    if (res.status === 204) return undefined as T;
    try {
      return (await res.json()) as T;
    } catch {
      throw new LedgerClientError("internal", FRIENDLY_ERRORS.internal);
    }
  }

  getSession() {
    return this.request<SessionInfo>("GET", "/api/session");
  }
  getLedger() {
    return this.request<LedgerResponse>("GET", "/api/ledger");
  }
  sendCommand(command: Command) {
    return this.request<CommandResponse>("POST", "/api/commands", { command });
  }
  getAudit(params: { q?: string; entityId?: string; cursor?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.entityId) qs.set("entityId", params.entityId);
    if (params.cursor) qs.set("cursor", params.cursor);
    const query = qs.toString();
    return this.request<AuditPage>("GET", `/api/audit${query ? `?${query}` : ""}`);
  }
  revealAccess(accountId: string) {
    return this.request<RevealResponse>("POST", `/api/accounts/${encodeURIComponent(accountId)}/reveal`, {});
  }
  getSecurity() {
    return this.request<SecurityOverview>("GET", "/api/security");
  }
  async revokeSession(sessionId: string) {
    await this.request<unknown>("POST", `/api/security/sessions/${encodeURIComponent(sessionId)}/revoke`, {});
  }
  async revokeAllMySessions() {
    await this.request<unknown>("POST", "/api/security/revoke-all", {});
  }
  createEmergency(body: { kind: "lock" | "unlock"; targetMemberId: string; reason: string }) {
    return this.request<EmergencyRequest>("POST", "/api/security/emergency", body);
  }
  approveEmergency(id: string) {
    return this.request<EmergencyRequest>("POST", `/api/security/emergency/${encodeURIComponent(id)}/approve`, {});
  }
  cancelEmergency(id: string) {
    return this.request<EmergencyRequest>("POST", `/api/security/emergency/${encodeURIComponent(id)}/cancel`, {});
  }
  listSnapshots() {
    return this.request<SnapshotMeta[]>("GET", "/api/snapshots");
  }
  createSnapshot(label: string) {
    return this.request<SnapshotMeta>("POST", "/api/snapshots", { label });
  }
  async restoreSnapshot(id: string) {
    await this.request<unknown>("POST", `/api/snapshots/${encodeURIComponent(id)}/restore`, {});
  }
  exportData() {
    return this.request<Blob>("GET", "/api/export", undefined, "blob");
  }
  async signOut() {
    const handler = this.sessionEndedHandler;
    this.sessionEndedHandler = null;
    try {
      await this.request<unknown>("POST", "/api/session/sign-out", {});
    } catch {
      // Signing out locally still happens even if the server can't be reached.
    } finally {
      this.sessionEndedHandler = handler;
    }
  }
}
