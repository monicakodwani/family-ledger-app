import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LedgerClientError, type SessionInfo } from "@family-ledger/shared";
import { createAppClient } from "../data/createClient";
import { isDemoClient, type AppClient, type SessionEndCode } from "../data/types";
import type { AuthAdapter } from "./types";

type Status = "loading" | "signedOut" | "signedIn" | "failed";

interface AuthContextValue {
  status: Status;
  client: AppClient | null;
  auth: AuthAdapter | null;
  session: SessionInfo | null;
  endedReason: SessionEndCode | null;
  signInDemo(memberId: string): Promise<void>;
  /** After Supabase reports a session (passkey or email link), load the member session. */
  completeSignIn(): Promise<void>;
  signOut(reason?: SessionEndCode): Promise<void>;
  clearEndedReason(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [client, setClient] = useState<AppClient | null>(null);
  const [auth, setAuth] = useState<AuthAdapter | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [endedReason, setEndedReason] = useState<SessionEndCode | null>(null);
  const ending = useRef(false);

  /** Local sign-out: forget everything this tab knows. */
  const endLocally = useCallback(
    async (reason: SessionEndCode, c: AppClient | null, a: AuthAdapter | null, callServer: boolean) => {
      if (ending.current) return;
      ending.current = true;
      try {
        if (callServer && c) {
          try {
            await c.signOut();
          } catch {
            // ignore — local sign-out still happens
          }
        }
        if (a) await a.signOut();
        queryClient.clear();
        setSession(null);
        setEndedReason(reason === "signed_out" ? null : reason);
        setStatus("signedOut");
      } finally {
        ending.current = false;
      }
    },
    [queryClient],
  );

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const loaded = await createAppClient();
        if (cancelled) return;
        loaded.client.setSessionEndedHandler((code) => {
          void endLocally(code, loaded.client, loaded.auth, false);
        });
        unsubscribe = loaded.auth.onSignedOut(() => {
          void endLocally("unauthenticated", loaded.client, loaded.auth, false);
        });
        setClient(loaded.client);
        setAuth(loaded.auth);
        if (await loaded.auth.hasSession()) {
          try {
            const s = await loaded.client.getSession();
            if (cancelled) return;
            setSession(s);
            setStatus("signedIn");
            return;
          } catch (err) {
            if (err instanceof LedgerClientError && err.code === "unavailable") {
              setStatus("failed");
              return;
            }
            // Session-ending codes are handled by the handler above.
          }
        }
        if (!cancelled) setStatus((s) => (s === "loading" ? "signedOut" : s));
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [endLocally]);

  const signInDemo = useCallback(
    async (memberId: string) => {
      if (!client || !isDemoClient(client)) return;
      const s = await client.signIn(memberId);
      queryClient.clear();
      setSession(s);
      setEndedReason(null);
      setStatus("signedIn");
    },
    [client, queryClient],
  );

  const completeSignIn = useCallback(async () => {
    if (!client) return;
    const s = await client.getSession();
    queryClient.clear();
    setSession(s);
    setEndedReason(null);
    setStatus("signedIn");
  }, [client, queryClient]);

  const signOut = useCallback(
    (reason: SessionEndCode = "signed_out") => endLocally(reason, client, auth, true),
    [endLocally, client, auth],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      client,
      auth,
      session,
      endedReason,
      signInDemo,
      completeSignIn,
      signOut,
      clearEndedReason: () => setEndedReason(null),
    }),
    [status, client, auth, session, endedReason, signInDemo, completeSignIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** For screens that only render when signed in. */
export function useSignedIn(): { client: AppClient; session: SessionInfo; auth: AuthAdapter } {
  const { client, session, auth } = useAuth();
  if (!client || !session || !auth) throw new Error("Not signed in");
  return { client, session, auth };
}
