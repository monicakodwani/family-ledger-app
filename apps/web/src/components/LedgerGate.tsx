import type { ReactNode } from "react";
import { WifiOff } from "lucide-react";
import { useLedger } from "../data/hooks";
import { useOnline } from "../lib/useOnline";
import { Button } from "./ui/button";

/** Waits for the family ledger before showing a page; friendly offline and error states. */
export function LedgerGate({ children }: { children: ReactNode }) {
  const { data, isPending, isError, refetch, isFetching } = useLedger();
  const online = useOnline();
  if (data) return <>{children}</>;
  if (!online) return <OfflineScreen />;
  if (isPending) {
    return (
      <div role="status" aria-live="polite" className="space-y-4 py-4">
        <span className="sr-only">Loading the family ledger…</span>
        <div className="h-9 w-2/3 animate-pulse rounded-xl bg-cream-deep" />
        <div className="h-40 animate-pulse rounded-2xl bg-cream-deep" />
        <div className="h-24 animate-pulse rounded-2xl bg-cream-deep" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-3xl border border-line bg-card p-8 text-center shadow-card">
        <h1 className="text-2xl font-bold">We couldn't load the family ledger</h1>
        <p className="mt-3 text-muted">Please try again in a moment.</p>
        <Button size="lg" className="mt-6" onClick={() => void refetch()} disabled={isFetching}>
          Try again
        </Button>
      </div>
    );
  }
  return null;
}

export function OfflineScreen() {
  return (
    <div className="rounded-3xl border border-line bg-card p-8 text-center shadow-card">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-cream-deep text-muted">
        <WifiOff aria-hidden className="size-8" />
      </span>
      <h1 className="mt-4 text-2xl font-bold">You're offline</h1>
      <p className="mt-3 text-muted">
        Family money details aren't stored on this phone for safety, so they'll appear again when you're connected.
      </p>
      <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-cream-deep px-4 py-2 font-semibold text-ink">
        <span aria-hidden className="size-2.5 rounded-full bg-con-ink" /> Not connected
      </p>
    </div>
  );
}
