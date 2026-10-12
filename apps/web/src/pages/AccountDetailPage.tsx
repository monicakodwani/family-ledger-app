import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  Archive,
  FileText,
  Hourglass,
  Lightbulb,
  NotebookPen,
  Pencil,
  Scale,
  StickyNote,
  TrendingUp,
} from "lucide-react";
import {
  ASSET_CLASS_LABELS,
  LIQUIDITY_LABELS,
  deriveValue,
  isLiability,
  type Account,
  type LedgerState,
  type Valuation,
} from "@family-ledger/shared";
import { useAudit, useCommand, useLedgerData, useToday } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Card, EmptyState, SectionTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { ChoiceGroup, Field, Textarea } from "../components/ui/field";
import { ConfirmDialog, Sheet } from "../components/ui/dialog";
import { StatusChip } from "../components/StatusChip";
import { AccessSection } from "../components/AccessSection";
import { ActivityItem } from "../components/ActivityItem";
import { BarChart } from "../components/BarChart";
import { useToast } from "../components/Toaster";
import { NotFoundPage } from "./NotFoundPage";
import { formatDate, formatDay, inr, inrShort, memberName, personName } from "../lib/format";
import { findAccount } from "../lib/ledger";
import {
  DOCUMENT_KIND_LABELS,
  LIFECYCLE_LABELS,
  OWNERSHIP_LABELS,
  PLAN_STATUS_LABELS,
  SOURCE_LABELS,
} from "../lib/labels";
import { t } from "../i18n";

function Row({ label, children }: { label: string; children?: ReactNode }) {
  if (children === undefined || children === null || children === "" || children === false) return null;
  return (
    <div className="py-3">
      <dt className="text-[0.9375rem] text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium break-words">{children}</dd>
    </div>
  );
}

function valuationLine(ledger: LedgerState, v: Valuation): string {
  return `${SOURCE_LABELS[v.source]} · as of ${formatDate(v.valuationDate)} · added by ${memberName(ledger, v.enteredBy)}`;
}

export default function AccountDetailPage() {
  const { id } = useParams();
  const ledger = useLedgerData();
  const account = findAccount(ledger, id);
  if (!account) return <NotFoundPage />;
  return <AccountDetail account={account} ledger={ledger} />;
}

function AccountDetail({ account, ledger }: { account: Account; ledger: LedgerState }) {
  const today = useToday();
  const view = deriveValue(account, today);
  const liability = isLiability(account);
  const send = useCommand();
  const toast = useToast();
  const navigate = useNavigate();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const parent = findAccount(ledger, account.parentId);
  const children = ledger.accounts.filter((a) => a.parentId === account.id && !a.archivedAt);
  const linked = account.linkedAccountIds
    .map((lid) => findAccount(ledger, lid))
    .filter((a): a is Account => Boolean(a));
  const plans = ledger.plans.filter((p) => !p.archivedAt && p.relatedAccountIds.includes(account.id));
  const notes = ledger.notes.filter((n) => !n.archivedAt && n.accountId === account.id);
  const docs = ledger.documents.filter((d) => !d.archivedAt && d.accountIds.includes(account.id));

  const conflictHandler = () =>
    toast.error("Someone else changed this account just now. The latest version is shown — please try again.");

  const archive = async () => {
    setBusy(true);
    const res = await send(
      { type: "account.archive", id: account.id, expectedVersion: account.version },
      { successMessage: "Archived. You can bring it back any time from Archived.", onConflict: conflictHandler },
    );
    setBusy(false);
    setArchiveOpen(false);
    if (res) navigate("/accounts");
  };

  return (
    <div>
      <PageHeader
        back="/accounts"
        title={account.displayName}
        subtitle={[ASSET_CLASS_LABELS[account.assetClass], account.institution].filter(Boolean).join(" · ")}
      />
      {account.archivedAt && (
        <p className="mb-4 rounded-2xl bg-none-bg px-4 py-3 text-none-ink">
          This account is archived.{" "}
          <Link to="/archived" className="font-semibold text-accent">
            Bring it back from Archived
          </Link>
        </p>
      )}

      {/* ---------------- Money headline ---------------- */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-muted">
            {liability ? "Money owed (outstanding)" : "How much is in it"}
          </h2>
          {view.status !== "not_entered" && <StatusChip status={view.status} />}
        </div>
        {view.status === "conflicting" ? (
          <div className="mt-4">
            <p className="text-ink">
              Two amounts don't agree. Neither is counted in the totals until the family settles it.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {view.conflicting.map((v) => (
                <div key={v.id} className="rounded-xl border border-con-line bg-con-bg/50 p-4">
                  <p className="text-2xl font-bold tabular">{inrShort(v.amountMinor)}</p>
                  <p className="mt-1 text-[0.9375rem] text-muted">{valuationLine(ledger, v)}</p>
                </div>
              ))}
            </div>
            <Button className="mt-4" variant="secondary" block onClick={() => setSettleOpen(true)}>
              <Scale aria-hidden className="size-5" /> Settle this
            </Button>
          </div>
        ) : view.current ? (
          <div className="mt-2">
            <p className="text-[2.5rem] leading-tight font-bold tabular">{inrShort(view.current.amountMinor)}</p>
            <p className="text-muted tabular">{inr(view.current.amountMinor)}</p>
            <p className="mt-3 text-[0.9375rem] text-muted">{valuationLine(ledger, view.current)}</p>
            {view.current.sourceNote && <p className="mt-1 text-[0.9375rem] text-muted">“{view.current.sourceNote}”</p>}
            {view.newerEstimate && (
              <p className="mt-4 rounded-xl bg-est-bg px-4 py-3 text-est-ink">
                A newer estimate of {inrShort(view.newerEstimate.amountMinor)} was added on{" "}
                {formatDate(view.newerEstimate.valuationDate)}, but the verified amount is still shown.
              </p>
            )}
            {view.status === "outdated" && (
              <p className="mt-4 rounded-xl bg-old-bg px-4 py-3 text-old-ink">
                This amount is quite old. A fresh statement would help.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-2xl font-semibold">Not yet entered</p>
            <p className="mt-1 text-muted">
              {view.status === "waiting_for_statement"
                ? "We're waiting for a statement. You can still add an estimate."
                : "An estimate is fine."}
            </p>
          </div>
        )}
        {liability && account.creditLimitMinor && (
          <p className="mt-4 rounded-xl bg-cream px-4 py-3">
            Approved limit: <span className="font-semibold tabular">{inr(account.creditLimitMinor)}</span>
            <span className="block text-[0.9375rem] text-muted">
              This is the limit the bank allows — not money borrowed.
            </span>
          </p>
        )}
        <div className="mt-5 flex flex-col gap-3">
          <Button asChild size="lg" block>
            <Link to={`/accounts/${account.id}/update-amount`}>
              <TrendingUp aria-hidden className="size-5" /> {t("action.updateAmount")}
            </Link>
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button asChild variant="secondary" block>
              <Link to={`/accounts/${account.id}/edit`}>
                <Pencil aria-hidden className="size-4" /> {t("action.edit")}
              </Link>
            </Button>
            <Button asChild variant="secondary" block>
              <Link to={`/notes/new?accountId=${account.id}`}>
                <NotebookPen aria-hidden className="size-4" /> {t("action.addNote")}
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      {/* ---------------- Who owns it ---------------- */}
      <SectionTitle>Who owns it</SectionTitle>
      <Card className="py-2">
        <dl className="divide-y divide-line">
          <Row label="Ownership">{OWNERSHIP_LABELS[account.ownership.status]}</Row>
          <Row label="In the name of">
            {account.ownership.owners.length
              ? account.ownership.owners
                  .map((o) => `${personName(ledger, o.personId)}${o.sharePercent ? ` (${o.sharePercent}%)` : ""}`)
                  .join(", ")
              : undefined}
          </Row>
          <Row label={account.ownership.owners.length ? "Also linked to" : "Linked to (not yet confirmed)"}>
            {account.ownership.associatedPersonIds.length
              ? account.ownership.associatedPersonIds.map((p) => personName(ledger, p)).join(", ")
              : account.ownership.owners.length
                ? undefined
                : "Nobody recorded yet"}
          </Row>
          <Row label="Ownership note">{account.ownership.note}</Row>
          <Row label="Nominees">{account.nominees}</Row>
          <Row label="Managed by">
            {account.managedByPersonId
              ? `${personName(ledger, account.managedByPersonId)}${account.managerNote ? ` — ${account.managerNote}` : ""}`
              : "The family"}
          </Row>
          <Row label="Who has access">{account.authorisedAccess}</Row>
        </dl>
      </Card>

      {/* ---------------- Details ---------------- */}
      <SectionTitle>Details</SectionTitle>
      <Card className="py-2">
        <dl className="divide-y divide-line">
          <Row label="Type">{ASSET_CLASS_LABELS[account.assetClass]}</Row>
          <Row label="Where is this money?">{account.institution ?? "Not recorded yet"}</Row>
          <Row label="Also called">{account.nickname}</Row>
          <Row label="What kind of product">{account.productTypeNote}</Row>
          <Row label="About">{account.description}</Row>
          <Row label="Status">{account.lifecycle !== "active" ? LIFECYCLE_LABELS[account.lifecycle] : undefined}</Row>
          {!liability && <Row label="Can it be withdrawn?">{LIQUIDITY_LABELS[account.liquidity]}</Row>}
          <Row label="Restrictions">{account.restrictions}</Row>
          <Row label="Maturity date">
            {account.maturityDate ? (
              <>
                {formatDate(account.maturityDate)}{" "}
                <span className="font-normal text-muted">
                  {account.maturityDateConfirmed ? "· confirmed" : "· not confirmed yet — check the certificate"}
                </span>
              </>
            ) : undefined}
          </Row>
          <Row label="Interest">{account.interestDetails}</Row>
          <Row label="Originally invested">
            {account.originalInvestmentMinor ? inr(account.originalInvestmentMinor) : undefined}
          </Row>
          <Row label="Contributions">{account.contributionsNote}</Row>
          <Row label="Tax">{[account.taxTreatment, account.taxNotes].filter(Boolean).join(" — ") || undefined}</Row>
          <Row label="Inside">
            {parent ? (
              <Link to={`/accounts/${parent.id}`} className="text-accent">
                {parent.displayName}
              </Link>
            ) : undefined}
          </Row>
        </dl>
      </Card>

      <ValuationHistory account={account} ledger={ledger} />

      {/* ---------------- Sign-in & access ---------------- */}
      <SectionTitle>Sign-in &amp; access</SectionTitle>
      <Card>
        <AccessSection account={account} />
      </Card>
      {account.access.statementInstructions && (
        <>
          <SectionTitle>How to get a statement</SectionTitle>
          <Card>
            <p className="whitespace-pre-line">{account.access.statementInstructions}</p>
          </Card>
        </>
      )}

      {(linked.length > 0 || children.length > 0) && (
        <>
          <SectionTitle>Connected accounts</SectionTitle>
          <Card>
            <ul className="space-y-3">
              {linked.map((a) => (
                <li key={a.id}>
                  <Link to={`/accounts/${a.id}`} className="font-semibold text-accent">
                    {a.displayName}
                  </Link>
                  <p className="text-[0.9375rem] text-muted">
                    {isLiability(a) ? "Loan linked to this" : liability ? "Secures this loan" : "Linked"}
                  </p>
                </li>
              ))}
              {children.map((a) => (
                <li key={a.id}>
                  <Link to={`/accounts/${a.id}`} className="font-semibold text-accent">
                    {a.displayName}
                  </Link>
                  <p className="text-[0.9375rem] text-muted">
                    Holding inside this {a.includedInParentValue ? "· already counted in this amount" : ""}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <SectionTitle
        action={
          <Link
            to={`/notes/new?accountId=${account.id}`}
            className="inline-flex min-h-11 items-center font-semibold text-accent"
          >
            Add note
          </Link>
        }
      >
        Notes
      </SectionTitle>
      {notes.length === 0 ? (
        <EmptyState icon={<StickyNote aria-hidden className="size-6" />} title="No notes yet" />
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id}>
              <Link
                to={`/notes/${n.id}`}
                className="block rounded-2xl border border-line bg-card p-4 text-ink no-underline shadow-card hover:border-line-strong"
              >
                <p className="text-[0.875rem] font-semibold text-muted uppercase">
                  {n.kind === "question" ? (n.resolvedAt ? "Question · answered" : "Question") : "Note"} ·{" "}
                  {memberName(ledger, n.authorId)}
                </p>
                <p className="mt-1 line-clamp-3">{n.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {account.maturityDate && !account.maturityDateConfirmed && notes.some((n) => /matur|renew/i.test(n.body)) && (
        <p className="mt-2 px-1 text-[0.9375rem] text-muted">
          Notes are what someone thinks — the maturity date above becomes “confirmed” only when checked.
        </p>
      )}

      {plans.length > 0 && (
        <>
          <SectionTitle>Related plans</SectionTitle>
          <Card>
            <ul className="space-y-3">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <Lightbulb aria-hidden className="size-5 text-accent" />
                  <Link to={`/plans/${p.id}`} className="font-semibold text-accent">
                    {p.title}
                  </Link>
                  <span className="text-muted">· {PLAN_STATUS_LABELS[p.status]}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {docs.length > 0 && (
        <>
          <SectionTitle>Documents</SectionTitle>
          <Card>
            <ul className="space-y-3">
              {docs.map((d) => (
                <li key={d.id} className="flex items-start gap-3">
                  <FileText aria-hidden className="mt-0.5 size-5 text-accent" />
                  <span>
                    <span className="block font-semibold">{d.title}</span>
                    <span className="block text-[0.9375rem] text-muted">
                      {DOCUMENT_KIND_LABELS[d.kind]}
                      {d.whereKept ? ` · Kept: ${d.whereKept}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <ChangeHistory account={account} ledger={ledger} />

      <SectionTitle>More actions</SectionTitle>
      <div className="space-y-3">
        <Button
          variant="secondary"
          block
          onClick={() =>
            void send(
              { type: "account.setAwaitingStatement", id: account.id, value: !account.awaitingStatement },
              {
                successMessage: account.awaitingStatement
                  ? "Marked as no longer waiting for a statement."
                  : "Marked as waiting for a statement. Everyone can see this now.",
              },
            )
          }
        >
          <Hourglass aria-hidden className="size-5" />
          {account.awaitingStatement ? "No longer waiting for a statement" : "Mark as waiting for statement"}
        </Button>
        {!account.archivedAt && (
          <Button variant="secondary" block onClick={() => setArchiveOpen(true)}>
            <Archive aria-hidden className="size-5" /> {t("action.archive")}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive “${account.displayName}”?`}
        body={
          <>
            <p>It will be hidden from lists and totals. Nothing is deleted — its history is kept.</p>
            <p>You can bring it back any time from Archived.</p>
          </>
        }
        confirmLabel="Archive it"
        onConfirm={archive}
        busy={busy}
      />
      {view.status === "conflicting" && (
        <SettleSheet
          open={settleOpen}
          onOpenChange={setSettleOpen}
          account={account}
          ledger={ledger}
          options={view.conflicting}
        />
      )}
    </div>
  );
}

function SettleSheet({
  open,
  onOpenChange,
  account,
  ledger,
  options,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account: Account;
  ledger: LedgerState;
  options: Valuation[];
}) {
  const send = useCommand();
  const [keep, setKeep] = useState<string>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!keep) return;
    setBusy(true);
    const res = await send(
      {
        type: "valuation.resolveConflict",
        accountId: account.id,
        keepValuationId: keep,
        note: note.trim() || undefined,
      },
      { successMessage: "Settled. The other amount is kept in history." },
    );
    setBusy(false);
    if (res) onOpenChange(false);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Settle this"
      description="Which amount is right? The other one stays in history."
    >
      <div className="space-y-5">
        <ChoiceGroup
          name="keep"
          legend="Keep this amount"
          value={keep}
          onChange={setKeep}
          options={options.map((v) => ({ value: v.id, label: inr(v.amountMinor), hint: valuationLine(ledger, v) }))}
        />
        <Field label="How do you know?" optional>
          {({ id }) => <Textarea id={id} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <Button size="lg" block disabled={!keep || busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Settle it"}
        </Button>
      </div>
    </Sheet>
  );
}

function ValuationHistory({ account, ledger }: { account: Account; ledger: LedgerState }) {
  const send = useCommand();
  const [aside, setAside] = useState<Valuation | null>(null);
  const vals = [...account.valuations].sort((a, b) =>
    a.valuationDate !== b.valuationDate
      ? a.valuationDate < b.valuationDate
        ? 1
        : -1
      : a.enteredAt < b.enteredAt
        ? 1
        : -1,
  );
  const active = vals.filter((v) => !v.setAside);
  const dates = new Set(active.map((v) => v.valuationDate));
  const chartRows =
    dates.size >= 2
      ? [...active].reverse().map((v) => ({
          key: v.id,
          label: formatDate(v.valuationDate),
          amountMinor: v.amountMinor,
          note: v.confidence === "verified" ? "Verified" : "Estimated",
        }))
      : null;

  return (
    <>
      <SectionTitle>Amount history</SectionTitle>
      {vals.length === 0 ? (
        <EmptyState title="No amounts recorded yet" />
      ) : (
        <Card>
          {chartRows ? (
            <BarChart title={`Amounts over time for ${account.displayName}`} rows={chartRows} />
          ) : (
            <p className="mb-2 text-muted">History will appear once amounts are updated over time.</p>
          )}
          <ul className={chartRows ? "mt-5 divide-y divide-line border-t border-line" : "divide-y divide-line"}>
            {vals.map((v) => (
              <li key={v.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={v.setAside ? "font-semibold tabular text-muted line-through" : "font-semibold tabular"}
                  >
                    {inr(v.amountMinor)}
                  </span>
                  <StatusChip status={v.confidence === "verified" ? "verified" : "estimated"} />
                </div>
                <p className="mt-1 text-[0.9375rem] text-muted">{valuationLine(ledger, v)}</p>
                {v.sourceNote && <p className="text-[0.9375rem] text-muted">“{v.sourceNote}”</p>}
                {v.setAside ? (
                  <p className="mt-1 text-[0.9375rem] text-muted">
                    Set aside by {memberName(ledger, v.setAside.by)} on {formatDay(v.setAside.at)}
                    {v.setAside.note ? ` — ${v.setAside.note}` : ""}
                  </p>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {v.confidence === "estimated" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void send(
                            { type: "valuation.verify", accountId: account.id, valuationId: v.id },
                            { successMessage: "Marked as verified." },
                          )
                        }
                      >
                        Mark as verified
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setAside(v)}>
                      This was a mistake
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <ConfirmDialog
        open={Boolean(aside)}
        onOpenChange={(o) => !o && setAside(null)}
        title="Set this amount aside?"
        body={<p>It will stop counting, but stays in the history so everyone can see what happened.</p>}
        confirmLabel="Set it aside"
        onConfirm={async () => {
          if (!aside) return;
          await send(
            { type: "valuation.setAside", accountId: account.id, valuationId: aside.id },
            { successMessage: "Set aside. It's still in the history." },
          );
          setAside(null);
        }}
      />
    </>
  );
}

function ChangeHistory({ account, ledger }: { account: Account; ledger: LedgerState }) {
  const audit = useAudit({ entityId: account.id });
  const entries = audit.data?.pages.flatMap((p) => p.entries) ?? [];
  return (
    <>
      <SectionTitle>Change history</SectionTitle>
      {entries.length === 0 ? (
        <EmptyState title={audit.isPending ? "Loading…" : "No changes recorded yet"} />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line bg-card shadow-card divide-y divide-line">
          {entries.slice(0, 10).map((e) => (
            <ActivityItem key={e.id} entry={e} ledger={ledger} showLink={false} />
          ))}
        </ul>
      )}
    </>
  );
}
