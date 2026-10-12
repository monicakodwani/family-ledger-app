import type { ApiErrorCode, LedgerClient, SessionInfo } from "@family-ledger/shared";

/** Codes that end the local session and show a friendly "signed out" screen. */
export type SessionEndCode =
  | Extract<ApiErrorCode, "unauthenticated" | "session_revoked" | "member_locked" | "not_a_member">
  | "idle"
  | "signed_out";

export const SESSION_ENDING_CODES: ReadonlySet<string> = new Set([
  "unauthenticated",
  "session_revoked",
  "member_locked",
  "not_a_member",
]);

/** Both clients add a hook so the UI learns when the server ended the session. */
export interface AppClient extends LedgerClient {
  setSessionEndedHandler(handler: ((code: SessionEndCode) => void) | null): void;
}

/** Extra controls only the in-browser demo has. Never present in connected builds. */
export interface DemoControls {
  readonly isDemo: true;
  listSignInMembers(): Promise<Array<{ id: string; displayName: string; status: "active" | "invited" | "locked" }>>;
  signIn(memberId: string): Promise<SessionInfo>;
  /** Simulates Face ID: marks the session as freshly authenticated for a few minutes. */
  confirmFreshAuth(): void;
  /** Adds clearly fictional sample amounts so charts can be explored. */
  fillSampleAmounts(): Promise<number>;
  hasSampleAmounts(): boolean;
}

export function isDemoClient(client: AppClient): client is AppClient & DemoControls {
  return (client as Partial<DemoControls>).isDemo === true;
}
