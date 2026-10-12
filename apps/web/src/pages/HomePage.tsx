import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  FlaskConical,
  Lightbulb,
  ListChecks,
  ScanFace,
} from "lucide-react";
import { computeTotals, toBig, upcomingMaturities } from "@family-ledger/shared";
import { useAuth, useSignedIn } from "../auth/AuthProvider";
import { useAudit, useErrorToast, useLedgerData, useMe, useToday, qk } from "../data/hooks";
import { isDemoClient } from "../data/types";
import { Card, EmptyState, LinkCard, RowGroup, SectionTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/dialog";
import { SplitBar } from "../components/BarChart";
import { ActivityItem } from "../components/ActivityItem";
import { useToast } from "../components/Toaster";
import { formatDate, formatDay, greeting, inr, inrShort, plural } from "../lib/format";
import { amountCounts, findAccount, liabilities, thingsToCheck } from "../lib/ledger";
import { PLAN_STATUS_LABELS } from "../lib/labels";
import { getPasskeyOfferDismissed, setPasskeyOfferDismissed } from "../lib/prefs";
import { useQueryClient } from "@tanstack/react-query";

export function HomePage() {
  const ledger = useLedgerData();
  const today = useToday();
  const me = useMe();
  const totals = computeTotals(ledger, today);
  const counts = amountCounts(ledger, today);
  const checks = thingsToCheck(ledger, today);
  const maturities = upcomingMaturities(ledger, today);
  const plans = ledger.plans.filter((p) => !p.archivedAt && p.status !== "completed");
  const audit = useAudit();
  const recent = (audit.data?.pages[0]?.entries ?? []).filter((e) => !e.action.startsWith("session.")).slice(0, 4);
  const loans = liabilities(ledger);
  const hasAnyAmount = counts.withAmount > 0;
  const accountsCount = ledger.accounts.filter((a) => !a.archivedAt).length;

  return (
    <div>
      <header className="mb-6">
        <p className="text-muted">{formatDay(new Date().toISOString())}</p>
        <h1 className="mt-1 text-[2rem] font-bold tracking-tight text-ink outline-none">
          {greeting()}, {me.displayName}
        </h1>
      </header>

      <PasskeyOffer />
      <LinkCard to="/money" label="Family estimated net worth — see Our Money" className="p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-muted">Family net worth (estimated)</h2>
          <ChevronRight aria-hidden className="mt-1 size-5 shrink-0 text-muted" />
        </div>
        {hasAnyAmount ? (
          <>
            <p className="mt-2 text-[2.5rem] leading-none font-bold tracking-tight tabular">
              {inrShort(totals.netWorthMinor)}
            </p>
            <p className="mt-2 text-muted tabular">{inr(totals.netWorthMinor)}</p>
          </>
        ) : (
          <p className="mt-3 text-2xl font-semibold text-ink">No amounts entered yet</p>
        )}
        {!totals.isComplete && (
          <p className="mt-4 inline-flex items-start gap-2 rounded-xl border border-est-line bg-est-bg px-3 py-2 text-[0.9375rem] leading-snug font-semibold text-est-ink">
            <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0" />
            Partial — {counts.withAmount} of {counts.total} accounts have amounts
          </p>
        )}
        {hasAnyAmount && (
          <div className="mt-5">
            <SplitBar
              label="Verified and estimated amounts"
              parts={[
                { label: "Verified from statements", amountMinor: totals.verifiedAssetsMinor, tone: "verified" },
                {
                  label: "Estimated or needs a fresh check",
                  amountMinor: totals.unverifiedAssetsMinor,
                  tone: "estimated",
                },
              ]}
            />
          </div>
        )}
        <p className="mt-4 text-[0.9375rem] text-muted">
          {hasAnyAmount
            ? "Missing amounts are not counted as zero. This total grows as more amounts are entered."
            : "Add amounts to accounts to see a total."}
        </p>
      </LinkCard>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard to="/money" label="Total assets" value={hasAnyAmount ? inrShort(totals.assetsMinor) : "—"} />
        <StatCard
          to="/money#loans"
          label="Loans owed"
          value={
            toBig(totals.liabilitiesMinor) > 0n
              ? inrShort(totals.liabilitiesMinor)
              : loans.length
                ? "Not yet entered"
                : "None"
          }
        />
        <StatCard to="/accounts" label="Accounts" value={String(accountsCount)} />
        <StatCard
          to="/activity"
          label="Last updated"
          value={totals.lastUpdated ? formatDay(totals.lastUpdated) : formatDay(ledger.updatedAt)}
          small
        />
      </div>
      {toBig(totals.creditLimitsMinor) > 0n && (
        <Link
          to="/money#loans"
          className="mt-3 flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-card px-5 py-3 text-ink no-underline shadow-card"
        >
          <span>
            <span className="block font-semibold">Approved overdraft limits</span>
            <span className="block text-[0.9375rem] text-muted">A limit, not money borrowed</span>
          </span>
          <span className="tabular font-semibold">{inrShort(totals.creditLimitsMinor)}</span>
        </Link>
      )}

      {import.meta.env.VITE_APP_MODE === "demo" && <SampleAmountsCard hasAnyAmount={hasAnyAmount} />}

      <SectionTitle action={<SeeAll to="/checks" label="See all things to check" />}>Things to check</SectionTitle>
      {checks.length === 0 ? (
        <EmptyState icon={<CircleCheck aria-hidden className="size-6" />} title="Nothing to check right now" />
      ) : (
        <RowGroup>
          {checks.slice(0, 4).map((c) => (
            <Link
              key={c.key}
              to={c.href}
              className="flex min-h-14 items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-cream"
            >
              <ListChecks aria-hidden className="size-5 shrink-0 text-accent" />
              <span className="flex-1 leading-snug">{c.title}</span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
            </Link>
          ))}
          {checks.length > 4 && (
            <Link
              to="/checks"
              className="block min-h-12 px-4 py-3 font-semibold text-accent no-underline hover:bg-cream"
            >
              {plural(checks.length - 4, "more thing")} to check
            </Link>
          )}
        </RowGroup>
      )}

      <SectionTitle>Coming up</SectionTitle>
      {maturities.length === 0 ? (
        <EmptyState
          icon={<CalendarClock aria-hidden className="size-6" />}
          title="No maturity dates in the next few months"
        >
          When an FD or policy has a maturity date, it will show here.
        </EmptyState>
      ) : (
        <RowGroup>
          {maturities.map((m) => {
            const account = findAccount(ledger, m.accountId);
            return (
              <Link
                key={m.accountId}
                to={`/accounts/${m.accountId}`}
                className="flex min-h-14 items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-cream"
              >
                <CalendarClock aria-hidden className="size-5 shrink-0 text-accent" />
                <span className="flex-1">
                  <span className="block font-semibold">{account?.displayName}</span>
                  <span className="block text-[0.9375rem] text-muted">
                    {m.daysAway < 0 ? "Matured" : "Matures"} {formatDate(m.date)} ·{" "}
                    {m.confirmed ? "confirmed date" : "date not confirmed"}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
              </Link>
            );
          })}
        </RowGroup>
      )}

      <SectionTitle action={<SeeAll to="/activity" label="See all family activity" />}>
        Recent family activity
      </SectionTitle>
      {recent.length === 0 ? (
        <EmptyState title={audit.isPending ? "Loading…" : "No activity yet"} />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line bg-card shadow-card divide-y divide-line">
          {recent.map((e) => (
            <ActivityItem key={e.id} entry={e} ledger={ledger} />
          ))}
        </ul>
      )}

      <SectionTitle action={<SeeAll to="/plans" label="See all plans" />}>Our plans</SectionTitle>
      {plans.length === 0 ? (
        <EmptyState icon={<Lightbulb aria-hidden className="size-6" />} title="No plans yet">
          <Link to="/plans/new" className="font-semibold text-accent">
            Start a plan
          </Link>
        </EmptyState>
      ) : (
        <RowGroup>
          {plans.slice(0, 4).map((p) => (
            <Link
              key={p.id}
              to={`/plans/${p.id}`}
              className="flex min-h-14 items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-cream"
            >
              <Lightbulb aria-hidden className="size-5 shrink-0 text-accent" />
              <span className="flex-1">
                <span className="block font-semibold leading-snug">{p.title}</span>
                <span className="block text-[0.9375rem] text-muted">{PLAN_STATUS_LABELS[p.status]}</span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
            </Link>
          ))}
        </RowGroup>
      )}
    </div>
  );
}

function SeeAll({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-accent no-underline hover:bg-accent-soft"
    >
      See all
    </Link>
  );
}

function StatCard({ to, label, value, small }: { to: string; label: string; value: string; small?: boolean }) {
  return (
    <LinkCard to={to} className="p-4">
      <span className="block text-[0.9375rem] font-medium text-muted">{label}</span>
      <span
        className={
          small || !/\d/.test(value)
            ? "mt-1 block text-lg font-semibold leading-snug tabular"
            : "mt-1 block text-xl font-bold tabular"
        }
      >
        {value}
      </span>
    </LinkCard>
  );
}

function SampleAmountsCard({ hasAnyAmount }: { hasAnyAmount: boolean }) {
  const { client } = useSignedIn();
  const queryClient = useQueryClient();
  const toast = useToast();
  const showError = useErrorToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!isDemoClient(client) || client.hasSampleAmounts() || hasAnyAmount) return null;

  const fill = async () => {
    setBusy(true);
    try {
      await client.fillSampleAmounts();
      await queryClient.invalidateQueries({ queryKey: qk.ledger });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast.success("Sample amounts added.");
      setOpen(false);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-4 border-est-line bg-est-bg p-4">
      <div className="flex items-start gap-3">
        <FlaskConical aria-hidden className="mt-0.5 size-5 shrink-0 text-est-ink" />
        <div>
          <p className="font-semibold text-est-ink">Demo: try it with sample amounts</p>
          <p className="mt-0.5 text-[0.9375rem] text-est-ink">Made-up numbers, just to explore the charts.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setOpen(true)}>
            Fill in sample amounts
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Fill in sample amounts?"
        body={
          <p>
            This adds fictional sample numbers to six demo accounts. They are not real and disappear when you close the
            app.
          </p>
        }
        confirmLabel="Add sample amounts"
        onConfirm={fill}
        busy={busy}
      />
    </Card>
  );
}

function PasskeyOffer() {
  const { auth } = useAuth();
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!auth || auth.kind !== "connected" || !auth.passkeysAvailable() || getPasskeyOfferDismissed()) return;
    void auth.listPasskeys().then((list) => {
      if (!cancelled && list && list.length === 0) setShow(true);
    });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  if (!show || !auth) return null;
  const setup = async () => {
    setBusy(true);
    const result = await auth.registerPasskey();
    setBusy(false);
    if (result.ok) {
      toast.success("Face ID sign-in is set up on this phone.");
      setShow(false);
    } else toast.error(result.message);
  };
  return (
    <Card className="mb-4">
      <div className="flex items-start gap-3">
        <ScanFace aria-hidden className="mt-0.5 size-6 shrink-0 text-accent" />
        <div>
          <p className="font-semibold">Set up Face ID sign-in</p>
          <p className="mt-1 text-muted">Next time you can sign in with Face ID instead of a link.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void setup()} disabled={busy}>
              {busy ? "Waiting for Face ID…" : "Set up Face ID"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPasskeyOfferDismissed();
                setShow(false);
              }}
            >
              Maybe later
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
