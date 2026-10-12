import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CircleDashed, History, Search } from "lucide-react";
import {
  breakdown,
  computeTotals,
  deriveValue,
  isLiability,
  personView,
  toBig,
  fromBig,
  type BreakdownDimension,
  type LedgerState,
} from "@family-ledger/shared";
import { useLedgerData, useMe, useToday } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Card, EmptyState, RowGroup, SectionTitle } from "../components/ui/card";
import { Input, Segmented, Select } from "../components/ui/field";
import { BarChart, SplitBar, type BarRow } from "../components/BarChart";
import { AccountRow } from "../components/AccountRow";
import { formatDate, inr, inrShort, plural } from "../lib/format";
import { amountCounts, findAccount, relevantAccounts } from "../lib/ledger";
import { t } from "../i18n";

const DIMENSIONS: Array<{ value: BreakdownDimension; label: string; title: string }> = [
  { value: "assetClass", label: "Type", title: "By type of investment" },
  { value: "institution", label: "Where", title: "By where the money is" },
  { value: "manager", label: "Managed by", title: "By who manages it" },
  { value: "owner", label: "Whose name", title: "By whose name it's in" },
];

function idsHref(ids: string[], label: string): string {
  return `/accounts?ids=${encodeURIComponent(ids.join(","))}&from=${encodeURIComponent(label)}`;
}

function rowsFor(ledger: LedgerState, dimension: BreakdownDimension, today: string): BarRow[] {
  return breakdown(ledger, dimension, today).map((r) => ({
    key: r.key,
    label: r.label,
    amountMinor: r.amountMinor,
    href: idsHref(r.accountIds, r.label),
    note: [plural(r.accountIds.length, "account"), r.missingCount ? `${r.missingCount} without amounts` : null]
      .filter(Boolean)
      .join(" · "),
  }));
}

export default function MoneyPage() {
  const ledger = useLedgerData();
  const today = useToday();
  const totals = computeTotals(ledger, today);
  const counts = amountCounts(ledger, today);
  const [dimension, setDimension] = useState<BreakdownDimension>("assetClass");
  const dim = DIMENSIONS.find((d) => d.value === dimension)!;
  const hasAny = counts.withAmount > 0;

  return (
    <div>
      <PageHeader title={t("page.money")} />

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-muted">Family net worth (estimated)</h2>
        <p className="mt-1 text-[2.25rem] leading-tight font-bold tabular">
          {hasAny ? inrShort(totals.netWorthMinor) : "—"}
        </p>
        {hasAny && <p className="text-muted tabular">{inr(totals.netWorthMinor)}</p>}
        {!totals.isComplete && (
          <p className="mt-3 inline-flex items-start gap-2 rounded-xl border border-est-line bg-est-bg px-3 py-2 text-[0.9375rem] leading-snug font-semibold text-est-ink">
            <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0" />
            Partial — {counts.withAmount} of {counts.total} accounts have amounts
          </p>
        )}
        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat label="What we have (assets)" value={inr(totals.assetsMinor)} />
          <Stat label="Loans outstanding" value={inr(totals.liabilitiesMinor)} id="loans" />
          {toBig(totals.creditLimitsMinor) > 0n && (
            <Stat
              label="Approved overdraft limits"
              hint="A limit the bank allows — not money borrowed. Never subtracted."
              value={inr(totals.creditLimitsMinor)}
            />
          )}
        </dl>
        {totals.conflictingIds.length > 0 && (
          <p className="mt-4 rounded-xl bg-con-bg px-4 py-3 text-con-ink">
            {plural(totals.conflictingIds.length, "account has", "accounts have")} amounts that don't agree, so{" "}
            {totals.conflictingIds.length === 1 ? "it isn't" : "they aren't"} counted until settled.
          </p>
        )}
      </Card>

      {!hasAny && (
        <div className="mt-4">
          <EmptyState title="No amounts yet">
            Charts appear once some amounts are entered. Open an account and tap “Update amount”.
          </EmptyState>
        </div>
      )}

      {hasAny && (
        <>
          <SectionTitle>How sure are we?</SectionTitle>
          <Card>
            <SplitBar
              label="Verified and unverified assets"
              parts={[
                { label: "Verified from statements", amountMinor: totals.verifiedAssetsMinor, tone: "verified" },
                {
                  label: "Estimated or needs a fresh check",
                  amountMinor: totals.unverifiedAssetsMinor,
                  tone: "estimated",
                },
              ]}
            />
            <div className="mt-5 border-t border-line pt-5">
              <BarChart title="Assets by how sure we are" rows={rowsFor(ledger, "verification", today)} />
            </div>
          </Card>

          <SectionTitle>Assets and loans</SectionTitle>
          <Card>
            <SplitBar
              label="Assets compared with loans"
              parts={[
                { label: "What we have", amountMinor: totals.assetsMinor, tone: "accent" },
                { label: "What we owe", amountMinor: totals.liabilitiesMinor, tone: "rose" },
              ]}
            />
            <LoansList ledger={ledger} today={today} />
          </Card>

          <SectionTitle>Can it be withdrawn?</SectionTitle>
          <Card>
            <BarChart title="Assets by how easily they can be withdrawn" rows={rowsFor(ledger, "liquidity", today)} />
          </Card>

          <SectionTitle>Break it down</SectionTitle>
          <Card>
            <Segmented label="Break down by" value={dimension} onChange={setDimension} options={DIMENSIONS} />
            <h3 className="mt-5 mb-4 font-semibold">{dim.title}</h3>
            <BarChart title={dim.title} rows={rowsFor(ledger, dimension, today)} />
          </Card>

          <ValueHistory ledger={ledger} />
        </>
      )}

      <PersonSection ledger={ledger} today={today} />
      <FindAccounts ledger={ledger} today={today} />
    </div>
  );
}

function Stat({ label, value, hint, id }: { label: string; value: string; hint?: string; id?: string }) {
  return (
    <div id={id} className="rounded-xl bg-cream px-4 py-3">
      <dt className="text-[0.9375rem] font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold tabular">{value || "—"}</dd>
      {hint && <dd className="mt-1 text-[0.875rem] leading-snug text-muted">{hint}</dd>}
    </div>
  );
}

function LoansList({ ledger, today }: { ledger: LedgerState; today: string }) {
  const loans = relevantAccounts(ledger).filter(isLiability);
  if (loans.length === 0) return null;
  return (
    <ul className="mt-5 space-y-3 border-t border-line pt-5">
      {loans.map((a) => {
        const view = deriveValue(a, today);
        return (
          <li key={a.id}>
            <Link
              to={`/accounts/${a.id}`}
              className="font-semibold text-ink underline decoration-line-strong underline-offset-4"
            >
              {a.displayName}
            </Link>
            <p className="text-[0.9375rem] text-muted">
              Borrowed: {view.current ? inr(view.current.amountMinor) : "not yet entered"}
              {a.creditLimitMinor && <> · Approved limit {inrShort(a.creditLimitMinor)} (not money borrowed)</>}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function ValueHistory({ ledger }: { ledger: LedgerState }) {
  const rows = useMemo(() => {
    const accounts = relevantAccounts(ledger).filter((a) => !isLiability(a));
    const dates = [
      ...new Set(accounts.flatMap((a) => a.valuations.filter((v) => !v.setAside).map((v) => v.valuationDate))),
    ].sort();
    if (dates.length < 2) return null;
    return dates.slice(-6).map((d) => {
      let total = 0n;
      let n = 0;
      for (const a of accounts) {
        const latest = a.valuations
          .filter((v) => !v.setAside && v.valuationDate <= d && v.currency === ledger.baseCurrency)
          .sort((x, y) => (x.valuationDate < y.valuationDate ? 1 : -1))[0];
        if (latest) {
          total += toBig(latest.amountMinor);
          n += 1;
        }
      }
      return {
        key: d,
        label: formatDate(d),
        amountMinor: fromBig(total),
        note: `Known amounts for ${plural(n, "account")}`,
      };
    });
  }, [ledger]);

  return (
    <>
      <SectionTitle>Over time</SectionTitle>
      <Card>
        {rows ? (
          <>
            <p className="mb-4 text-muted">
              Total of the amounts we knew on each date. Accounts without amounts yet aren't included.
            </p>
            <BarChart title="Known assets over time" rows={rows} />
          </>
        ) : (
          <p className="flex items-start gap-3 text-muted">
            <History aria-hidden className="mt-0.5 size-5 shrink-0" />
            History will appear once amounts are updated over time.
          </p>
        )}
      </Card>
    </>
  );
}

function PersonSection({ ledger, today }: { ledger: LedgerState; today: string }) {
  const me = useMe();
  const family = ledger.people.filter((p) => p.memberId);
  const [personId, setPersonId] = useState(me.personId);
  const view = personView(ledger, personId, today);
  const person = ledger.people.find((p) => p.id === personId);
  const isMe = personId === me.personId;
  const confirmedIds = [...view.soleAccountIds, ...view.confirmedShareAccountIds];
  const name = isMe ? "your" : `${person?.name ?? "their"}'s`;

  return (
    <>
      <SectionTitle>By person</SectionTitle>
      <Card>
        <Segmented
          label="Choose a person"
          value={personId}
          onChange={setPersonId}
          options={family.map((p) => ({ value: p.id, label: p.memberId === me.id ? `${p.name} (you)` : p.name }))}
        />
        <div className="mt-5">
          <h3 className="font-semibold">In {name} name (confirmed)</h3>
          <p className="mt-1 text-2xl font-bold tabular">
            {confirmedIds.length ? inrShort(view.attributedMinor) : "—"}
          </p>
          {confirmedIds.length === 0 ? (
            <p className="mt-1 text-muted">No accounts are confirmed as being in {name} name yet.</p>
          ) : (
            <AccountMiniList ledger={ledger} ids={confirmedIds} today={today} />
          )}
        </div>
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="font-semibold">Shared or not yet confirmed</h3>
          <p className="mt-1 text-muted">
            {isMe ? "You're" : `${person?.name ?? "They're"} is`} linked to these, but ownership or shares aren't
            confirmed — so nothing is split or added above.
          </p>
          {view.sharedUnallocatedAccountIds.length === 0 ? (
            <p className="mt-2 text-muted">None.</p>
          ) : (
            <AccountMiniList ledger={ledger} ids={view.sharedUnallocatedAccountIds} today={today} />
          )}
        </div>
      </Card>
    </>
  );
}

function AccountMiniList({ ledger, ids, today }: { ledger: LedgerState; ids: string[]; today: string }) {
  return (
    <ul className="mt-3 space-y-2">
      {ids.map((id) => {
        const a = findAccount(ledger, id);
        if (!a) return null;
        const view = deriveValue(a, today);
        return (
          <li key={id} className="flex items-baseline justify-between gap-3">
            <Link
              to={`/accounts/${id}`}
              className="min-w-0 text-ink underline decoration-line-strong underline-offset-4"
            >
              {a.displayName}
            </Link>
            <span className="shrink-0 tabular text-muted">
              {view.current ? inrShort(view.current.amountMinor) : "Not yet entered"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type Filter = "all" | "assets" | "loans" | "verified" | "estimated" | "missing";

function FindAccounts({ ledger, today }: { ledger: LedgerState; today: string }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const accounts = ledger.accounts
    .filter((a) => !a.archivedAt)
    .filter((a) => {
      const s = q.trim().toLowerCase();
      if (s && ![a.displayName, a.institution, a.nickname, a.description].some((f) => f?.toLowerCase().includes(s)))
        return false;
      const status = deriveValue(a, today).status;
      switch (filter) {
        case "assets":
          return !isLiability(a);
        case "loans":
          return isLiability(a);
        case "verified":
          return status === "verified";
        case "estimated":
          return status === "estimated" || status === "outdated";
        case "missing":
          return status === "not_entered" || status === "waiting_for_statement";
        default:
          return true;
      }
    });
  return (
    <>
      <SectionTitle>Find an account</SectionTitle>
      <div className="space-y-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            aria-label="Search accounts"
            placeholder="Search by name or where it is"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-12"
          />
        </div>
        <Select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">Show everything</option>
          <option value="assets">Only what we have (assets)</option>
          <option value="loans">Only loans</option>
          <option value="verified">Only verified amounts</option>
          <option value="estimated">Only estimated amounts</option>
          <option value="missing">Only accounts without amounts</option>
        </Select>
        {accounts.length === 0 ? (
          <EmptyState title="No accounts match" />
        ) : (
          <RowGroup>
            {accounts.map((a) => (
              <AccountRow key={a.id} account={a} ledger={ledger} today={today} />
            ))}
          </RowGroup>
        )}
      </div>
    </>
  );
}
