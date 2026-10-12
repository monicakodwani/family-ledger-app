import { useState } from "react";
import { Link } from "react-router";
import { CircleCheck, Circle, ChevronRight, Lightbulb, Plus } from "lucide-react";
import type { CheckItem } from "@family-ledger/shared";
import { useCommand, useLedgerData, useToday } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Card, EmptyState, RowGroup, SectionTitle } from "../components/ui/card";
import { Field, Input, Select, Textarea } from "../components/ui/field";
import { Sheet } from "../components/ui/dialog";
import { formatDay, memberName } from "../lib/format";
import { findAccount, thingsToCheck } from "../lib/ledger";
import { t } from "../i18n";

export default function ChecksPage() {
  const ledger = useLedgerData();
  const today = useToday();
  const send = useCommand();
  const [title, setTitle] = useState("");
  const [accountId, setAccountId] = useState("");
  const [doneTarget, setDoneTarget] = useState<CheckItem | null>(null);
  const [doneNote, setDoneNote] = useState("");
  const [showDone, setShowDone] = useState(false);
  const items = thingsToCheck(ledger, today);
  const explicit = items.filter((i) => i.kind === "explicit");
  const derived = items.filter((i) => i.kind === "derived");
  const done = ledger.checks.filter((c) => c.doneAt && !c.archivedAt);

  return (
    <div>
      <PageHeader title={t("page.checks")} back="/more" />

      <form
        className="mb-6 space-y-3 rounded-2xl border border-line bg-card p-4 shadow-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          const res = await send(
            { type: "check.create", title: title.trim(), accountId: accountId || undefined },
            { successMessage: "Added to the list. Everyone can see it." },
          );
          if (res) {
            setTitle("");
            setAccountId("");
          }
        }}
      >
        <Field label="Add something to check">
          {({ id }) => (
            <Input
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Find the gold locker receipt"
            />
          )}
        </Field>
        <Field label="About an account" optional>
          {({ id }) => (
            <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Not about one account</option>
              {ledger.accounts
                .filter((a) => !a.archivedAt)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Button type="submit" variant="secondary" disabled={!title.trim()}>
          <Plus aria-hidden className="size-4" /> Add
        </Button>
      </form>

      <SectionTitle>On our list</SectionTitle>
      {explicit.length === 0 ? (
        <EmptyState icon={<CircleCheck aria-hidden className="size-6" />} title="Nothing on the list" />
      ) : (
        <RowGroup>
          {explicit.map((c) => {
            const account = findAccount(ledger, c.accountId);
            return (
              <div key={c.key} className="flex items-start gap-3 px-4 py-3">
                <button
                  type="button"
                  aria-label={`Check off: ${c.title}`}
                  onClick={() => {
                    setDoneNote("");
                    setDoneTarget(c.item ?? null);
                  }}
                  className="-m-1 flex size-12 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-soft"
                >
                  <Circle aria-hidden className="size-7" />
                </button>
                <div className="min-w-0 flex-1 py-1.5">
                  <p className="font-semibold leading-snug">{c.title}</p>
                  <p className="text-[0.9375rem] text-muted">
                    Added by {memberName(ledger, c.item?.createdBy)}
                    {account && (
                      <>
                        {" · "}
                        <Link to={`/accounts/${account.id}`} className="text-accent">
                          {account.displayName}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </RowGroup>
      )}

      <SectionTitle>Noticed in our records</SectionTitle>
      <p className="-mt-1 mb-3 px-1 text-[0.9375rem] text-muted">
        These come from gaps in the information. Open one to fill it in.
      </p>
      {derived.length === 0 ? (
        <EmptyState title="Nothing noticed" />
      ) : (
        <RowGroup>
          {derived.map((c) => (
            <Link
              key={c.key}
              to={c.href}
              className="flex min-h-14 items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-cream"
            >
              <Lightbulb aria-hidden className="size-5 shrink-0 text-accent" />
              <span className="flex-1 leading-snug">{c.title}</span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
            </Link>
          ))}
        </RowGroup>
      )}

      {done.length > 0 && (
        <div className="mt-8">
          <Button variant="ghost" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}>
            {showDone ? "Hide" : "Show"} checked items ({done.length})
          </Button>
          {showDone && (
            <Card className="mt-2 space-y-3">
              {done.map((c) => (
                <div key={c.id} className="flex items-start gap-3">
                  <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-ver-ink" />
                  <div className="flex-1">
                    <p className="text-muted line-through">{c.title}</p>
                    <p className="text-[0.9375rem] text-muted">
                      Checked by {memberName(ledger, c.doneBy)} · {formatDay(c.doneAt)}
                      {c.doneNote ? ` — “${c.doneNote}”` : ""}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3"
                      onClick={() =>
                        void send(
                          { type: "check.setDone", id: c.id, done: false },
                          { successMessage: "Back on the list." },
                        )
                      }
                    >
                      Put back on the list
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      <Sheet
        open={Boolean(doneTarget)}
        onOpenChange={(o) => !o && setDoneTarget(null)}
        title="Check this off?"
        description={doneTarget?.title}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!doneTarget) return;
            const res = await send(
              { type: "check.setDone", id: doneTarget.id, done: true, note: doneNote.trim() || undefined },
              { successMessage: "Checked off. Thank you!" },
            );
            if (res) setDoneTarget(null);
          }}
        >
          <Field label="What did you find out?" optional>
            {({ id }) => <Textarea id={id} rows={3} value={doneNote} onChange={(e) => setDoneNote(e.target.value)} />}
          </Field>
          <Button type="submit" size="lg" block>
            Check it off
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
