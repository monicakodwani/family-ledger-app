/**
 * Small typed adapter over Supabase's passkey API (beta). Feature-detects the
 * methods so an older/newer supabase-js, or a browser without WebAuthn,
 * degrades to the email link instead of crashing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthResult, PasskeyItem } from "./types";

type Result<T> = Promise<{ data: T | null; error: { message?: string } | null }>;

interface PasskeyCapableAuth {
  signInWithPasskey?: () => Result<unknown>;
  registerPasskey?: () => Result<unknown>;
  passkey?: {
    list?: () => Result<Array<{ id: string; friendly_name?: string; created_at: string; last_used_at?: string }>>;
    delete?: (params: { passkeyId: string }) => Result<unknown>;
  };
}

export const PASSKEYS_UNAVAILABLE = "Passkeys aren't available yet — use the email link.";

function auth(supabase: SupabaseClient): PasskeyCapableAuth {
  return supabase.auth as unknown as PasskeyCapableAuth;
}

export function browserSupportsPasskeys(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

export function passkeysAvailable(supabase: SupabaseClient): boolean {
  return browserSupportsPasskeys() && typeof auth(supabase).signInWithPasskey === "function";
}

function friendly(error: { message?: string } | null | undefined, fallback: string): AuthResult {
  // Cancelled Face ID prompts are normal; never show library error text.
  void error;
  return { ok: false, message: fallback };
}

export async function signInWithPasskey(supabase: SupabaseClient): Promise<AuthResult> {
  const fn = auth(supabase).signInWithPasskey;
  if (!browserSupportsPasskeys() || typeof fn !== "function") return { ok: false, message: PASSKEYS_UNAVAILABLE };
  try {
    const { error } = await fn.call(supabase.auth);
    if (error) return friendly(error, "Face ID sign-in didn't finish. You can try again or use the email link.");
    return { ok: true };
  } catch {
    return { ok: false, message: "Face ID sign-in didn't finish. You can try again or use the email link." };
  }
}

export async function registerPasskey(supabase: SupabaseClient): Promise<AuthResult> {
  const fn = auth(supabase).registerPasskey;
  if (!browserSupportsPasskeys() || typeof fn !== "function") return { ok: false, message: PASSKEYS_UNAVAILABLE };
  try {
    const { error } = await fn.call(supabase.auth);
    if (error) return friendly(error, "Face ID wasn't set up. You can try again any time from Security.");
    return { ok: true };
  } catch {
    return { ok: false, message: "Face ID wasn't set up. You can try again any time from Security." };
  }
}

export async function listPasskeys(supabase: SupabaseClient): Promise<PasskeyItem[] | null> {
  const api = auth(supabase).passkey;
  if (!api || typeof api.list !== "function") return null;
  try {
    const { data, error } = await api.list.call(api);
    if (error || !data) return [];
    return data.map((p) => ({
      id: p.id,
      name: p.friendly_name || "Passkey",
      createdAt: p.created_at,
      lastUsedAt: p.last_used_at,
    }));
  } catch {
    return [];
  }
}

export async function deletePasskey(supabase: SupabaseClient, passkeyId: string): Promise<AuthResult> {
  const api = auth(supabase).passkey;
  if (!api || typeof api.delete !== "function") return { ok: false, message: PASSKEYS_UNAVAILABLE };
  try {
    const { error } = await api.delete.call(api, { passkeyId });
    if (error) return { ok: false, message: "That passkey couldn't be removed. Please try again." };
    return { ok: true };
  } catch {
    return { ok: false, message: "That passkey couldn't be removed. Please try again." };
  }
}
