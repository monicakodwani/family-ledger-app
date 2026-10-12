export type AuthResult = { ok: true } | { ok: false; message: string };

export interface PasskeyItem {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
}

/** Sign-in plumbing. Demo mode uses a no-op adapter; connected mode wraps Supabase Auth. */
export interface AuthAdapter {
  readonly kind: "demo" | "connected";
  /** True if a sign-in session already exists on this device (e.g. after an email link). */
  hasSession(): Promise<boolean>;
  getAccessToken(): Promise<string | null>;
  passkeysAvailable(): boolean;
  signInWithPasskey(): Promise<AuthResult>;
  sendEmailLink(email: string): Promise<AuthResult>;
  registerPasskey(): Promise<AuthResult>;
  listPasskeys(): Promise<PasskeyItem[] | null>;
  deletePasskey(id: string): Promise<AuthResult>;
  /** Local sign-out (clears the session stored in this tab). */
  signOut(): Promise<void>;
  /** Called when the auth library reports the user signed out elsewhere. */
  onSignedOut(callback: () => void): () => void;
}

export const demoAuthAdapter: AuthAdapter = {
  kind: "demo",
  hasSession: async () => false,
  getAccessToken: async () => null,
  passkeysAvailable: () => false,
  signInWithPasskey: async () => ({ ok: false, message: "Not used in the demo." }),
  sendEmailLink: async () => ({ ok: false, message: "Not used in the demo." }),
  registerPasskey: async () => ({ ok: false, message: "Not used in the demo." }),
  listPasskeys: async () => null,
  deletePasskey: async () => ({ ok: false, message: "Not used in the demo." }),
  signOut: async () => undefined,
  onSignedOut: () => () => undefined,
};
