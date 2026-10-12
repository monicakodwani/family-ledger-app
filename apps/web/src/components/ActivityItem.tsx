import { useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { isMinorUnits, type AuditEntry, type LedgerState } from "@family-ledger/shared";
import { formatDate, formatDateTime, inr, memberName } from "../lib/format";
import { auditHref, prettySummary } from "../lib/ledger";
import { cn } from "../lib/cn";

const FIELD_LABELS: Record<string, string> = {
  displayName: "Name",
  institution: "Where the money is",
  assetClass: "Type",
  ownership: "Who owns it",
  valuation: "Amount",
  awaitingStatement: "Waiting for statement",
  archivedAt: "Archived",
  archived: "Archived",
  body: "Words",
  comment: "Reply",
  pinned: "Pinned",
  resolved: "Answered",
  done: "Done",
  status: "Status",
  agreedBy: "Agreement",
  maturityDate: "Maturity date",
  maturityDateConfirmed: "Maturity date confirmed",
  creditLimitMinor: "Approved limit",
  originalInvestmentMinor: "Original investment",
  budgetMinor: "Budget",
  liquidity: "Can it be withdrawn?",
  access: "Sign-in & access",
  description: "Description",
  title: "Title",
  targetDate: "Target date",
  conflict: "Amounts that disagree",
  confidence: "How sure",
  setAside: "Set aside",
};

/** Turn any stored value into something a person can read. */
export function readableValue(field: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    if (/Minor$/.test(field) && isMinorUnits(value)) return inr(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
    return value;
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length ? value.map((v) => readableValue(field, v)).join(", ") : "None";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.amountMinor === "string" && isMinorUnits(obj.amountMinor)) {
      const bits = [inr(obj.amountMinor)];
      if (obj.confidence) bits.push(obj.confidence === "verified" ? "verified" : "estimated");
      if (typeof obj.valuationDate === "string") bits.push(`as of ${formatDate(obj.valuationDate)}`);
      return bits.join(", ");
    }
    if ("status" in obj && "owners" in obj) return `Ownership: ${String(obj.status)}`;
    return "Details changed";
  }
  return "—";
}

export function ActivityItem({
  entry,
  ledger,
  showLink = true,
}: {
  entry: AuditEntry;
  ledger: LedgerState;
  showLink?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const who = memberName(ledger, entry.actorId);
  const href = showLink ? auditHref(entry) : undefined;
  const hasChanges = entry.changes.length > 0;
  return (
    <li className="px-4 py-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-[0.9375rem] font-bold",
            entry.category === "security" ? "bg-wait-bg text-wait-ink" : "bg-accent-soft text-accent",
          )}
        >
          {entry.category === "security" ? <ShieldCheck className="size-4.5" /> : who.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="leading-snug">
            <span className="font-semibold">{who}</span>
            <span className="text-muted"> · </span>
            {href ? (
              <Link
                to={href}
                className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent"
              >
                {prettySummary(entry.summary)}
              </Link>
            ) : (
              prettySummary(entry.summary)
            )}
          </p>
          <p className="mt-1 text-[0.9375rem] text-muted">{formatDateTime(entry.at)}</p>
          {entry.reason && <p className="mt-1 text-[0.9375rem] text-muted">Reason: {entry.reason}</p>}
          {hasChanges && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="mt-1 -ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[0.9375rem] font-semibold text-accent hover:bg-accent-soft"
            >
              {open ? "Hide what changed" : "See what changed"}
              <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
            </button>
          )}
          {open && (
            <dl className="mt-2 space-y-2 rounded-xl bg-cream p-3 text-[0.9375rem]">
              {entry.changes.map((c, i) => (
                <div key={`${c.field}-${i}`}>
                  <dt className="font-semibold">{FIELD_LABELS[c.field] ?? c.field}</dt>
                  <dd className="mt-0.5 grid gap-0.5">
                    {c.before !== undefined && (
                      <span>
                        <span className="text-muted">Before: </span>
                        {readableValue(c.field, c.before)}
                      </span>
                    )}
                    <span>
                      <span className="text-muted">{c.before !== undefined ? "After: " : ""}</span>
                      {readableValue(c.field, c.after)}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </li>
  );
}
