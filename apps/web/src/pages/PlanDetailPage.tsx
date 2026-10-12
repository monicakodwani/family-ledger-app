import { useRef, useState, type RefObject } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  Archive,
  Check,
  Gavel,
  Lightbulb,
  ListTodo,
  MessageCircle,
  Pencil,
  Plus,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import type { LedgerState, Plan, PlanEntry, PlanEntryType, PlanStatus } from "@family-ledger/shared";
import { useCommand, useLedgerData, useMe } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Card, EmptyState, SectionTitle } from "../components/ui/card";
import { Checkbox, Field, Input, Segmented, Select, Textarea } from "../components/ui/field";
import { ConfirmDialog, Sheet } from "../components/ui/dialog";
import { MoneyInput, readAmount } from "../components/MoneyInput";
import { useToast } from "../components/Toaster";
import { NotFoundPage } from "./NotFoundPage";
import { formatDate, formatDateTime, inr, joinNames, memberName, personName } from "../lib/format";
import { findAccount } from "../lib/ledger";
import { ENTRY_LABELS, PLAN_STATUS_LABELS, PLAN_STATUS_ORDER } from "../lib/labels";
import { cn } from "../lib/cn";

const ENTRY_STYLE: Record<PlanEntryType, { icon: LucideIcon; card: string; badge: string }> = {
  proposal: { icon: Lightbulb, card: "border-accent/30 bg-accent-soft/50", badge: "bg-accent-soft text-accent" },
  discussion: { icon: MessageCircle, card: "border-line bg-card", badge: "bg-cream-deep text-ink" },
  decision: { icon: Gavel, card: "border-ver-line bg-ver-bg/60", badge: "bg-ver-bg text-ver-ink" },
  action_item: { icon: ListTodo, card: "border-est-line bg-est-bg/50", badge: "bg-est-bg text-est-ink" },
};

export default function PlanDetailPage() {
  const { id } = useParams();
  const ledger = useLedgerData();
  const plan = ledger.plans.find((p) => p.id === id);
  if (!plan) return <NotFoundPage />;
  return <PlanDetail plan={plan} ledger={ledger} />;
}

function PlanDetail({ plan, ledger }: { plan: Plan; ledger: LedgerState }) {
  const send = useCommand();
  const me = useMe();
  const toast = useToast();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [entryType, setEntryType] = useState<"discussion" | "proposal" | "action_item">("discussion");
  const [placeholder, setPlaceholder] = useState<string>();
  const notes = ledger.notes.filter((n) => n.planId === plan.id && !n.archivedAt);

  const conflict = () =>
    toast.error("Someone changed this plan just now. The latest version is shown — please try again.");

  const changeStatus = (status: PlanStatus) =>
    send(
      { type: "plan.update", id: plan.id, expectedVersion: plan.version, patch: { status } },
      { successMessage: `Moved to “${PLAN_STATUS_LABELS[status]}”. Everyone can see this now.`, onConflict: conflict },
    );

  const disagree = () => {
    setEntryType("discussion");
    setPlaceholder("What would you do differently? It's okay to see it another way.");
    composerRef.current?.focus();
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div>
      <PageHeader
        back="/plans"
        title={plan.title}
        subtitle={[plan.category, `Started by ${memberName(ledger, plan.proposedBy)}`].filter(Boolean).join(" · ")}
      />

      <Card className="space-y-4">
        <Field label="Where is this plan now?">
          {({ id }) => (
            <Select id={id} value={plan.status} onChange={(e) => void changeStatus(e.target.value as PlanStatus)}>
              {PLAN_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {PLAN_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {plan.description && <p className="whitespace-pre-line">{plan.description}</p>}
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-cream px-4 py-3">
            <dt className="text-[0.9375rem] text-muted">Target date</dt>
            <dd className="font-semibold">{plan.targetDate ? formatDate(plan.targetDate) : "Not set"}</dd>
          </div>
          <div className="rounded-xl bg-cream px-4 py-3">
            <dt className="text-[0.9375rem] text-muted">Budget</dt>
            <dd className="font-semibold tabular">{plan.budgetMinor ? inr(plan.budgetMinor) : "Not set"}</dd>
          </div>
        </dl>
        {plan.relatedAccountIds.length > 0 && (
          <div>
            <p className="text-[0.9375rem] text-muted">Related accounts</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {plan.relatedAccountIds.map((aid) => {
                const a = findAccount(ledger, aid);
                return a ? (
                  <li key={aid}>
                    <Link
                      to={`/accounts/${aid}`}
                      className="inline-flex min-h-11 items-center rounded-full border border-line px-4 font-semibold text-accent no-underline hover:bg-cream"
                    >
                      {a.displayName}
                    </Link>
                  </li>
                ) : null;
              })}
            </ul>
          </div>
        )}
        <Button variant="secondary" block onClick={() => setEditOpen(true)}>
          <Pencil aria-hidden className="size-4" /> Edit plan details
        </Button>
      </Card>

      <Steps plan={plan} ledger={ledger} />

      <SectionTitle>Conversation</SectionTitle>
      <p className="-mt-1 mb-3 px-1 text-[0.9375rem] text-muted">
        Proposals, thoughts, decisions and actions are kept apart so it's clear what was agreed.
      </p>
      {plan.entries.length === 0 ? (
        <EmptyState icon={<MessageCircle aria-hidden className="size-6" />} title="No messages yet">
          Share the first thought below.
        </EmptyState>
      ) : (
        <ol className="space-y-3">
          {plan.entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} plan={plan} ledger={ledger} meId={me.id} onDisagree={disagree} />
          ))}
        </ol>
      )}

      <Composer
        plan={plan}
        type={entryType}
        setType={setEntryType}
        textareaRef={composerRef}
        placeholder={placeholder}
        onPosted={() => setPlaceholder(undefined)}
      />
      <RecordDecision plan={plan} />

      <SectionTitle
        action={
          <Link
            to={`/notes/new?planId=${plan.id}`}
            className="inline-flex min-h-11 items-center font-semibold text-accent"
          >
            Add note
          </Link>
        }
      >
        Notes
      </SectionTitle>
      {notes.length === 0 ? (
        <EmptyState title="No notes on this plan" />
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id}>
              <Link
                to={`/notes/${n.id}`}
                className="block rounded-2xl border border-line bg-card p-4 text-ink no-underline shadow-card"
              >
                {n.title && <span className="block font-semibold">{n.title}</span>}
                <span className="line-clamp-2">{n.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <Button variant="secondary" block onClick={() => setArchiveOpen(true)}>
          <Archive aria-hidden className="size-5" /> Archive this plan
        </Button>
      </div>

      <EditPlanSheet open={editOpen} onOpenChange={setEditOpen} plan={plan} ledger={ledger} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive this plan?"
        body={
          <p>
            It will be hidden from the plans list. Nothing is deleted — you can bring it back any time from Archived.
          </p>
        }
        confirmLabel="Archive plan"
        onConfirm={async () => {
          const res = await send(
            { type: "plan.archive", id: plan.id },
            { successMessage: "Plan archived. You can bring it back from Archived." },
          );
          setArchiveOpen(false);
          if (res) navigate("/plans");
        }}
      />
    </div>
  );
}

function Steps({ plan, ledger }: { plan: Plan; ledger: LedgerState }) {
  const send = useCommand();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const add = async () => {
    if (!title.trim()) return;
    const res = await send(
      { type: "plan.addTask", planId: plan.id, title: title.trim(), assigneePersonId: assignee || undefined },
      { successMessage: "Step added." },
    );
    if (res) {
      setTitle("");
      setAssignee("");
    }
  };
  return (
    <>
      <SectionTitle>Steps</SectionTitle>
      <Card className="space-y-3">
        {plan.tasks.length === 0 && <p className="text-muted">No steps yet.</p>}
        {plan.tasks.map((task) => (
          <Checkbox
            key={task.id}
            checked={task.done}
            onChange={(e) =>
              void send(
                { type: "plan.setTaskDone", planId: plan.id, taskId: task.id, done: e.target.checked },
                { successMessage: e.target.checked ? "Step done. Thank you!" : "Step reopened." },
              )
            }
            label={<span className={task.done ? "text-muted line-through" : ""}>{task.title}</span>}
            hint={[
              task.assigneePersonId ? `For ${personName(ledger, task.assigneePersonId)}` : "Anyone can do this",
              task.done && task.doneBy ? `done by ${memberName(ledger, task.doneBy)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className="space-y-3 border-t border-line pt-4"
        >
          <Field label="Add a step">
            {({ id }) => (
              <Input
                id={id}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="e.g. Ask the bank about FD rates"
              />
            )}
          </Field>
          <Field label="Who will do it?" optional>
            {({ id }) => (
              <Select id={id} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Anyone</option>
                {ledger.people
                  .filter((p) => p.memberId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Button type="submit" variant="secondary" disabled={!title.trim()}>
            <Plus aria-hidden className="size-4" /> Add step
          </Button>
        </form>
      </Card>
    </>
  );
}

function EntryCard({
  entry,
  plan,
  ledger,
  meId,
  onDisagree,
}: {
  entry: PlanEntry;
  plan: Plan;
  ledger: LedgerState;
  meId: string;
  onDisagree: () => void;
}) {
  const send = useCommand();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.body);
  const [showHistory, setShowHistory] = useState(false);
  const style = ENTRY_STYLE[entry.type];
  const Icon = style.icon;
  const author = memberName(ledger, entry.authorId);
  const mine = entry.authorId === meId;
  const isDecision = entry.type === "decision";
  const agreed = entry.agreedBy.map((m) => memberName(ledger, m));
  const iAgree = entry.agreedBy.includes(meId);
  const waiting = ledger.members
    .filter((m) => m.status === "active" && !entry.agreedBy.includes(m.id))
    .map((m) => m.displayName);
  const heading =
    entry.type === "discussion"
      ? `${author} shared a thought`
      : entry.type === "proposal"
        ? `${author} proposed`
        : entry.type === "decision"
          ? `${author} recorded a decision`
          : `${author} added an action`;

  return (
    <li className={cn("rounded-2xl border p-4 shadow-card", style.card)}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", style.badge)}>
          <Icon aria-hidden className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">
            {heading}
            <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[0.8125rem] font-semibold", style.badge)}>
              {ENTRY_LABELS[entry.type]}
            </span>
          </p>
          <p className="text-[0.875rem] text-muted">
            {formatDateTime(entry.createdAt)}
            {entry.editedAt && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => setShowHistory((s) => !s)}
                  aria-expanded={showHistory}
                  className="font-semibold text-accent underline underline-offset-2"
                >
                  edited
                </button>
              </>
            )}
          </p>
          {editing ? (
            <form
              className="mt-2 space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                const res = await send(
                  { type: "plan.editEntry", planId: plan.id, entryId: entry.id, body: draft.trim() },
                  {
                    successMessage: isDecision
                      ? "Updated. Others will be asked to agree again."
                      : "Updated. The earlier wording is kept.",
                  },
                );
                if (res) setEditing(false);
              }}
            >
              <Textarea
                aria-label="Edit your words"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
              />
              {isDecision && (
                <p className="text-[0.9375rem] text-muted">
                  Changing a decision clears others' agreement so they can look again.
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <p className="mt-2 whitespace-pre-line">{entry.body}</p>
          )}
          {showHistory && entry.history.length > 0 && (
            <div className="mt-3 rounded-xl bg-card/80 p-3 text-[0.9375rem]">
              <p className="font-semibold">Earlier wording</p>
              <ul className="mt-1 space-y-2">
                {entry.history.map((h, i) => (
                  <li key={i}>
                    <span className="text-muted">{formatDateTime(h.editedAt)}: </span>
                    {h.body}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isDecision && (
            <div className="mt-3 space-y-2">
              <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-ver-ink">
                <Check aria-hidden className="size-4" /> Agreed by {joinNames(agreed)}
              </p>
              {waiting.length > 0 && (
                <p className="text-[0.9375rem] text-muted">Waiting to hear from {joinNames(waiting)}</p>
              )}
              {!iAgree ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      void send(
                        { type: "plan.agree", planId: plan.id, entryId: entry.id, agree: true },
                        { successMessage: "Agreement recorded." },
                      )
                    }
                  >
                    <ThumbsUp aria-hidden className="size-4" /> I agree
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onDisagree}>
                    I see it differently
                  </Button>
                </div>
              ) : (
                !mine && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void send(
                        { type: "plan.agree", planId: plan.id, entryId: entry.id, agree: false },
                        { successMessage: "Your agreement was withdrawn." },
                      )
                    }
                  >
                    Withdraw my agreement
                  </Button>
                )
              )}
            </div>
          )}
          {mine && !editing && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 -ml-3"
              onClick={() => {
                setDraft(entry.body);
                setEditing(true);
              }}
            >
              <Pencil aria-hidden className="size-4" /> Edit my words
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function Composer({
  plan,
  type,
  setType,
  textareaRef,
  placeholder,
  onPosted,
}: {
  plan: Plan;
  type: "discussion" | "proposal" | "action_item";
  setType: (t: "discussion" | "proposal" | "action_item") => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  placeholder?: string;
  onPosted: () => void;
}) {
  const send = useCommand();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const hints = {
    discussion: "A thought, question or concern. Nothing is decided yet.",
    proposal: "Suggest something the family could do.",
    action_item: "Something that needs doing.",
  };
  return (
    <form
      className="mt-5 space-y-3 rounded-2xl border border-line bg-card p-4 shadow-card"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        const res = await send({ type: "plan.addEntry", planId: plan.id, entryType: type, body: body.trim() });
        setBusy(false);
        if (res) {
          setBody("");
          onPosted();
        }
      }}
    >
      <Segmented
        label="What are you adding?"
        value={type}
        onChange={setType}
        options={[
          { value: "discussion", label: "Thought" },
          { value: "proposal", label: "Proposal" },
          { value: "action_item", label: "Action" },
        ]}
      />
      <p className="text-[0.9375rem] text-muted">{hints[type]}</p>
      <Textarea
        ref={textareaRef}
        aria-label={`Write your ${ENTRY_LABELS[type].toLowerCase()}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={placeholder ?? "Write here…"}
      />
      <Button type="submit" block disabled={busy || !body.trim()}>
        {busy ? "Posting…" : `Post ${ENTRY_LABELS[type].toLowerCase()}`}
      </Button>
    </form>
  );
}

function RecordDecision({ plan }: { plan: Plan }) {
  const send = useCommand();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="secondary" block className="mt-3" onClick={() => setOpen(true)}>
        <Gavel aria-hidden className="size-5" /> Record a decision
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Record a decision"
        description="Record what the family decided. You will be listed as agreeing. Others can add their agreement."
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim()) return;
            setBusy(true);
            const res = await send(
              { type: "plan.recordDecision", planId: plan.id, body: body.trim() },
              { successMessage: "Decision recorded. Others can agree when they see it." },
            );
            setBusy(false);
            if (res) {
              setBody("");
              setOpen(false);
            }
          }}
        >
          <Textarea
            aria-label="The decision"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="e.g. We'll renew the FD for one more year."
          />
          <Button type="submit" size="lg" block disabled={busy || !body.trim()}>
            {busy ? "Saving…" : "Record this decision"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

function EditPlanSheet({
  open,
  onOpenChange,
  plan,
  ledger,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  plan: Plan;
  ledger: LedgerState;
}) {
  const send = useCommand();
  const [title, setTitle] = useState(plan.title);
  const [category, setCategory] = useState(plan.category ?? "");
  const [description, setDescription] = useState(plan.description ?? "");
  const [targetDate, setTargetDate] = useState(plan.targetDate ?? "");
  const [budget, setBudget] = useState(plan.budgetMinor ? (BigInt(plan.budgetMinor) / 100n).toString() : "");
  const [related, setRelated] = useState<string[]>(plan.relatedAccountIds);
  const [theirs, setTheirs] = useState<Plan | null>(null);

  const submit = async (expectedVersion: number) => {
    if (!title.trim()) return;
    const budgetMinor = budget.trim() ? readAmount(budget).minor : undefined;
    const res = await send(
      {
        type: "plan.update",
        id: plan.id,
        expectedVersion,
        patch: {
          title: title.trim(),
          category: category.trim() || undefined,
          description: description.trim() || undefined,
          targetDate: targetDate || undefined,
          budgetMinor: budgetMinor ?? undefined,
          relatedAccountIds: related,
        },
      },
      { onConflict: (current) => setTheirs(current as Plan) },
    );
    if (res) {
      setTheirs(null);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Edit plan details">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(plan.version);
        }}
      >
        {theirs && (
          <div role="alert" className="rounded-xl bg-est-bg p-4 text-est-ink">
            <p className="font-semibold">{memberName(ledger, theirs.updatedBy)} changed this while you were editing</p>
            <p className="mt-1 text-[0.9375rem]">
              Their title: “{theirs.title}”{theirs.targetDate ? ` · target ${formatDate(theirs.targetDate)}` : ""}
            </p>
            <Button className="mt-3" size="sm" onClick={() => void submit(theirs.version)}>
              Apply my changes again
            </Button>
          </div>
        )}
        <Field label="Title">
          {({ id }) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />}
        </Field>
        <Field label="Kind of plan" optional>
          {({ id }) => <Input id={id} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} />}
        </Field>
        <Field label="Description" optional>
          {({ id }) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Field label="Target date" optional>
          {({ id }) => <Input id={id} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />}
        </Field>
        <MoneyInput label="Budget (optional)" value={budget} onChange={setBudget} />
        <fieldset className="space-y-2">
          <legend className="mb-1.5 font-semibold">Related accounts</legend>
          {ledger.accounts
            .filter((a) => !a.archivedAt)
            .map((a) => (
              <Checkbox
                key={a.id}
                label={a.displayName}
                checked={related.includes(a.id)}
                onChange={(e) =>
                  setRelated((cur) => (e.target.checked ? [...cur, a.id] : cur.filter((x) => x !== a.id)))
                }
              />
            ))}
        </fieldset>
        <Button type="submit" size="lg" block>
          Save changes
        </Button>
      </form>
    </Sheet>
  );
}
