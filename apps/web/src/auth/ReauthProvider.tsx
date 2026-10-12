import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { ScanFace } from "lucide-react";
import { LedgerClientError } from "@family-ledger/shared";
import { Sheet } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { isDemoClient } from "../data/types";
import { useAuth } from "./AuthProvider";

/** Thrown when the person chose not to confirm; callers can ignore it quietly. */
export class ReauthCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "ReauthCancelled";
  }
}

type Run = <T>(fn: () => Promise<T>) => Promise<T>;

const ReauthContext = createContext<Run | null>(null);

/**
 * Sensitive actions may come back with `reauth_required`. We then ask for
 * Face ID / passkey (simulated in the demo) and retry exactly once.
 */
export function ReauthProvider({ children }: { children: ReactNode }) {
  const { client, auth } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback(() => {
    setProblem(null);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
    setBusy(false);
  };

  const confirm = async () => {
    if (!client) return finish(false);
    if (isDemoClient(client)) {
      client.confirmFreshAuth();
      return finish(true);
    }
    if (!auth) return finish(false);
    setBusy(true);
    const result = await auth.signInWithPasskey();
    setBusy(false);
    if (result.ok) finish(true);
    else setProblem(result.message);
  };

  const run = useCallback<Run>(
    async (fn) => {
      try {
        return await fn();
      } catch (err) {
        if (!(err instanceof LedgerClientError) || err.code !== "reauth_required") throw err;
        const ok = await ask();
        if (!ok) throw new ReauthCancelled();
        return fn();
      }
    },
    [ask],
  );

  const demo = client ? isDemoClient(client) : false;

  return (
    <ReauthContext.Provider value={run}>
      {children}
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (!o) finish(false);
        }}
        title="Confirm it's you"
        description="Confirm it's you to continue."
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-20 items-center justify-center rounded-3xl bg-accent-soft text-accent">
            <ScanFace aria-hidden className="size-11" />
          </span>
          {demo && (
            <p className="rounded-xl bg-est-bg px-4 py-3 text-est-ink">
              Demo: in the real app, Face ID or your passkey would appear here.
            </p>
          )}
          {problem && (
            <p role="alert" className="rounded-xl bg-con-bg px-4 py-3 text-con-ink">
              {problem}
            </p>
          )}
          <Button size="lg" block onClick={() => void confirm()} disabled={busy}>
            <ScanFace aria-hidden className="size-5" />
            {busy ? "Waiting for Face ID…" : demo ? "Confirm it's me" : "Confirm with Face ID"}
          </Button>
          <Button variant="secondary" size="lg" block onClick={() => finish(false)}>
            Not now
          </Button>
        </div>
      </Sheet>
    </ReauthContext.Provider>
  );
}

export function useSensitive(): Run {
  const ctx = useContext(ReauthContext);
  if (!ctx) throw new Error("useSensitive must be used inside ReauthProvider");
  return ctx;
}
