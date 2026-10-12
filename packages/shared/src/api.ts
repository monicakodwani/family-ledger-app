import { z } from "zod";
import type { AccessDetails, AuditEntry, LedgerState } from "./schema";

/**
 * The HTTP contract between the web app and the API. The demo adapter in the
 * browser implements the same TypeScript interface (LedgerClient in apps/web).
 */

export interface SessionInfo {
  mode: "demo" | "connected";
  member: { id: string; personId: string; displayName: string };
  session: { id: string; createdAt: string; lastSeenAt: string; isNewDevice: boolean };
  /** Seconds until the server will ask for Face ID / passkey again for sensitive actions. */
  freshAuthRemainingSeconds: number;
  idleTimeoutSeconds: number;
}

export interface LedgerResponse {
  ledger: LedgerState; // access details masked
  revision: number;
}

export interface CommandResponse {
  ledger: LedgerState;
  revision: number;
  entityId: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  nextCursor?: string;
  chainVerified: boolean;
}

export interface RevealResponse {
  access: AccessDetails;
}

export interface DeviceSession {
  id: string;
  memberId: string;
  label: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
  revokedAt?: string;
}

export interface EmergencyRequest {
  id: string;
  kind: "lock" | "unlock";
  targetMemberId: string;
  requestedBy: string;
  approvals: string[];
  reason: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "completed" | "cancelled" | "expired";
  completedAt?: string;
}

export interface SecurityOverview {
  sessions: DeviceSession[];
  members: Array<{ id: string; displayName: string; status: "active" | "invited" | "locked" }>;
  emergencyRequests: EmergencyRequest[];
  approvalsRequired: number;
}

export interface SnapshotMeta {
  id: string;
  createdAt: string;
  createdBy: string;
  label: string;
  revision: number;
}

export const ApiErrorCode = z.enum([
  "unauthenticated",
  "session_revoked",
  "member_locked",
  "not_a_member",
  "reauth_required",
  "forbidden",
  "not_found",
  "version_conflict",
  "invalid",
  "rate_limited",
  "storage_busy",
  "unavailable",
  "internal",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; current?: unknown };
}

export const EmergencyCreateBody = z.object({
  kind: z.enum(["lock", "unlock"]),
  targetMemberId: z.string().min(1).max(64),
  reason: z.string().trim().min(1).max(500),
});

export const SnapshotCreateBody = z.object({ label: z.string().trim().min(1).max(120) });

/** Friendly copy for each error, used by both client and server. Never technical. */
export const FRIENDLY_ERRORS: Record<ApiErrorCode, string> = {
  unauthenticated: "Please sign in again to continue.",
  session_revoked: "This device was signed out. Please sign in again.",
  member_locked: "This account is paused for safety. Please talk to the family to unlock it.",
  not_a_member: "This sign-in isn't part of the family ledger.",
  reauth_required: "For safety, please confirm it's you with Face ID or your passkey.",
  forbidden: "That isn't allowed.",
  not_found: "We couldn't find that. It may have been removed.",
  version_conflict: "Someone else changed this at the same time. Please review and try again.",
  invalid: "Some details need another look.",
  rate_limited: "That was a lot of requests. Please wait a minute and try again.",
  storage_busy: "The ledger is busy saving another change. Please try again.",
  unavailable: "Family Ledger can't be reached right now. Please try again shortly.",
  internal: "Something went wrong on our side. Your information is safe. Please try again.",
};
