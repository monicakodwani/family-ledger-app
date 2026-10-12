import { ArchiveRestore } from "lucide-react";
import { useCommand, useLedgerData } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { EmptyState, SectionTitle } from "../components/ui/card";
import { formatDay, memberName } from "../lib/format";
import { t } from "../i18n";
import type { ReactNode } from "react";

function ArchivedRow({ title, meta, onRestore }: { title: ReactNode; meta: string; onRestore: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-[0.9375rem] text-muted">{meta}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRestore}>
        <ArchiveRestore aria-hidden className="size-4" /> {t("action.restore")}
      </Button>
    </li>
  );
}

export default function ArchivedPage() {
  const ledger = useLedgerData();
  const send = useCommand();
  const accounts = ledger.accounts.filter((a) => a.archivedAt);
  const notes = ledger.notes.filter((n) => n.archivedAt);
  const plans = ledger.plans.filter((p) => p.archivedAt);
  const meta = (by?: string, at?: string) => `Archived by ${memberName(ledger, by)} · ${formatDay(at)}`;
  const list = "overflow-hidden rounded-2xl border border-line bg-card shadow-card divide-y divide-line";

  return (
    <div>
      <PageHeader title={t("page.archived")} back="/more" subtitle="Archived items can be restored." />
      {accounts.length + notes.length + plans.length === 0 && <EmptyState title="Nothing is archived" />}
      {accounts.length > 0 && (
        <>
          <SectionTitle>Accounts</SectionTitle>
          <ul className={list}>
            {accounts.map((a) => (
              <ArchivedRow
                key={a.id}
                title={a.displayName}
                meta={meta(a.archivedBy, a.archivedAt)}
                onRestore={() =>
                  void send({ type: "account.restore", id: a.id }, { successMessage: `“${a.displayName}” is back.` })
                }
              />
            ))}
          </ul>
        </>
      )}
      {plans.length > 0 && (
        <>
          <SectionTitle>Plans</SectionTitle>
          <ul className={list}>
            {plans.map((p) => (
              <ArchivedRow
                key={p.id}
                title={p.title}
                meta={meta(p.archivedBy, p.archivedAt)}
                onRestore={() =>
                  void send({ type: "plan.restore", id: p.id }, { successMessage: `“${p.title}” is back.` })
                }
              />
            ))}
          </ul>
        </>
      )}
      {notes.length > 0 && (
        <>
          <SectionTitle>Notes</SectionTitle>
          <ul className={list}>
            {notes.map((n) => (
              <ArchivedRow
                key={n.id}
                title={n.title ?? n.body.slice(0, 60)}
                meta={meta(n.archivedBy, n.archivedAt)}
                onRestore={() =>
                  void send({ type: "note.restore", id: n.id }, { successMessage: "Note brought back." })
                }
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
