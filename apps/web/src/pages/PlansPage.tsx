import { Link } from "react-router";
import { ChevronRight, Lightbulb, Plus } from "lucide-react";
import { useLedgerData } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { EmptyState, RowGroup } from "../components/ui/card";
import { PLAN_STATUS_LABELS, PLAN_STATUS_ORDER } from "../lib/labels";
import { formatDate, memberName, plural } from "../lib/format";
import { t } from "../i18n";

export default function PlansPage() {
  const ledger = useLedgerData();
  const plans = ledger.plans.filter((p) => !p.archivedAt);
  return (
    <div>
      <PageHeader
        title={t("page.plans")}
        action={
          <Button asChild size="sm">
            <Link to="/plans/new">
              <Plus aria-hidden className="size-5" /> New
            </Link>
          </Button>
        }
      />
      {plans.length === 0 && (
        <EmptyState icon={<Lightbulb aria-hidden className="size-6" />} title="No plans yet">
          Any idea is welcome — a holiday, an emergency fund, what to do when an FD matures.
        </EmptyState>
      )}
      <div className="space-y-6">
        {PLAN_STATUS_ORDER.map((status) => {
          const group = plans.filter((p) => p.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status} aria-labelledby={`st-${status}`}>
              <h2
                id={`st-${status}`}
                className="mb-2 px-1 text-[0.9375rem] font-bold tracking-wide text-muted uppercase"
              >
                {PLAN_STATUS_LABELS[status]} <span className="font-semibold normal-case">· {group.length}</span>
              </h2>
              <RowGroup>
                {group.map((p) => {
                  const open = p.tasks.filter((x) => !x.done).length;
                  return (
                    <Link
                      key={p.id}
                      to={`/plans/${p.id}`}
                      className="flex min-h-18 items-center gap-3 px-4 py-4 text-ink no-underline hover:bg-cream"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                        <Lightbulb aria-hidden className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold leading-snug">{p.title}</span>
                        <span className="mt-0.5 block text-[0.9375rem] text-muted">
                          {[
                            p.category,
                            `by ${memberName(ledger, p.proposedBy)}`,
                            p.targetDate ? `target ${formatDate(p.targetDate)}` : null,
                            open ? plural(open, "step") + " to do" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                    </Link>
                  );
                })}
              </RowGroup>
            </section>
          );
        })}
      </div>
    </div>
  );
}
