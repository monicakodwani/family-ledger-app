/**
 * Supabase Auth for connected mode. Loaded with a dynamic import so demo
 * builds never include it. Sessions live in sessionStorage (this tab only).
 */
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../env";
import * as passkeys from "./passkeys";
import type { AuthAdapter } from "./types";

export function createConnectedAuth(): AuthAdapter {
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      storage: window.sessionStorage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Passkeys are a Supabase beta feature; newer versions ignore this flag.
      experimental: { passkey: true },
    },
  });

  return {
    kind: "connected",
    async hasSession() {
      const { data } = await supabase.auth.getSession();
      return Boolean(data.session);
    },
    async getAccessToken() {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    },
    passkeysAvailable: () => passkeys.passkeysAvailable(supabase),
    signInWithPasskey: () => passkeys.signInWithPasskey(supabase),
    async sendEmailLink(email: string) {
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
          },
        });
        // Same message whether or not the address is a family member (no account probing).
        if (error && error.status === 429) {
          return { ok: false, message: "Too many links were requested. Please wait a few minutes and try again." };
        }
        return { ok: true };
      } catch {
        return { ok: false, message: "We couldn't send the link right now. Please try again shortly." };
      }
    },
    registerPasskey: () => passkeys.registerPasskey(supabase),
    listPasskeys: () => passkeys.listPasskeys(supabase),
    deletePasskey: (id: string) => passkeys.deletePasskey(supabase, id),
    async signOut() {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Local session is cleared regardless.
      }
    },
    onSignedOut(callback) {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") callback();
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
