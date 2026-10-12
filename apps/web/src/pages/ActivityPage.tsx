import { useEffect, useState } from "react";
import { Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAudit, useLedgerData } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/card";
import { Input } from "../components/ui/field";
import { ActivityItem } from "../components/ActivityItem";
import { t } from "../i18n";

export default function ActivityPage() {
  const ledger = useLedgerData();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);
  const audit = useAudit(debounced ? { q: debounced } : {});
  const entries = audit.data?.pages.flatMap((p) => p.entries) ?? [];
  const verified = audit.data?.pages[0]?.chainVerified;

  return (
    <div>
      <PageHeader title={t("page.activity")} back="/more" />
      {verified !== undefined && (
        <p
          className={
            verified
              ? "mb-4 flex items-start gap-2 rounded-2xl bg-ver-bg px-4 py-3 text-ver-ink"
              : "mb-4 flex items-start gap-2 rounded-2xl bg-con-bg px-4 py-3 text-con-ink"
          }
        >
          {verified ? (
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
          ) : (
            <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          )}
          {verified
            ? "History checked: nothing has been changed outside the app."
            : "Something in the history doesn't match. Please tell the family so it can be looked into."}
        </p>
      )}
      <div className="relative mb-4">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
        />
        <Input
          type="search"
          aria-label="Search activity"
          placeholder="Search activity"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-12"
        />
      </div>
      {entries.length === 0 ? (
        <EmptyState
          title={audit.isPending ? "Loading…" : debounced ? "Nothing matches your search" : "No activity yet"}
        />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line bg-card shadow-card divide-y divide-line">
          {entries.map((e) => (
            <ActivityItem key={e.id} entry={e} ledger={ledger} />
          ))}
        </ul>
      )}
      {audit.hasNextPage && (
        <Button
          variant="secondary"
          block
          className="mt-4"
          onClick={() => void audit.fetchNextPage()}
          disabled={audit.isFetchingNextPage}
        >
          {audit.isFetchingNextPage ? "Loading…" : "Show older activity"}
        </Button>
      )}
    </div>
  );
}
