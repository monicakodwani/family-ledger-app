import type {
  AuditPage,
  CommandResponse,
  EmergencyRequest,
  LedgerResponse,
  RevealResponse,
  SecurityOverview,
  SessionInfo,
  SnapshotMeta,
} from "./api";
import type { Command } from "./commands";

/**
 * What the web app needs from a backend. Implemented by:
 *  - DemoLedgerClient (browser memory, fictional data, resets on reload)
 *  - HttpLedgerClient (authenticated calls to the Cloudflare Worker API)
 *
 * HTTP mapping (all JSON, all require `Authorization: Bearer <access token>`):
 *   getSession            GET  /api/session
 *   getLedger             GET  /api/ledger
 *   sendCommand           POST /api/commands                {command}
 *   getAudit              GET  /api/audit?q=&entityId=&cursor=
 *   revealAccess          POST /api/accounts/:id/reveal      (fresh auth; audited)
 *   getSecurity           GET  /api/security
 *   revokeSession         POST /api/security/sessions/:id/revoke
 *   revokeAllMySessions   POST /api/security/revoke-all     (fresh auth)
 *   createEmergency       POST /api/security/emergency      {kind,targetMemberId,reason} (fresh auth)
 *   approveEmergency      POST /api/security/emergency/:id/approve (fresh auth)
 *   cancelEmergency       POST /api/security/emergency/:id/cancel
 *   listSnapshots         GET  /api/snapshots
 *   createSnapshot        POST /api/snapshots               {label} (fresh auth)
 *   restoreSnapshot       POST /api/snapshots/:id/restore   (fresh auth)
 *   exportData            GET  /api/export                  (fresh auth)
 *   signOut               POST /api/session/sign-out
 * Errors: non-2xx with body ApiErrorBody.
 */
export interface LedgerClient {
  readonly mode: "demo" | "connected";
  getSession(): Promise<SessionInfo>;
  getLedger(): Promise<LedgerResponse>;
  sendCommand(command: Command): Promise<CommandResponse>;
  getAudit(params?: { q?: string; entityId?: string; cursor?: string }): Promise<AuditPage>;
  revealAccess(accountId: string): Promise<RevealResponse>;
  getSecurity(): Promise<SecurityOverview>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllMySessions(): Promise<void>;
  createEmergency(body: { kind: "lock" | "unlock"; targetMemberId: string; reason: string }): Promise<EmergencyRequest>;
  approveEmergency(id: string): Promise<EmergencyRequest>;
  cancelEmergency(id: string): Promise<EmergencyRequest>;
  listSnapshots(): Promise<SnapshotMeta[]>;
  createSnapshot(label: string): Promise<SnapshotMeta>;
  restoreSnapshot(id: string): Promise<void>;
  exportData(): Promise<Blob>;
  signOut(): Promise<void>;
}

/** Error thrown by clients; `message` is always friendly copy. */
export class LedgerClientError extends Error {
  constructor(
    public code: import("./api").ApiErrorCode,
    message: string,
    public current?: unknown,
  ) {
    super(message);
    this.name = "LedgerClientError";
  }
}
