import { useState } from "react";
import { Link, useParams } from "react-router";
import { Archive, ArchiveRestore, CircleCheck, CircleHelp, Pencil, Pin, PinOff, StickyNote } from "lucide-react";
import type { Comment, LedgerState, Note } from "@family-ledger/shared";
import { useCommand, useLedgerData, useMe } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Card, SectionTitle } from "../components/ui/card";
import { Field, Input, Textarea } from "../components/ui/field";
import { ConfirmDialog } from "../components/ui/dialog";
import { NotFoundPage } from "./NotFoundPage";
import { formatDateTime, memberName } from "../lib/format";
import { findAccount } from "../lib/ledger";

export default function NoteDetailPage() {
  const { id } = useParams();
  const ledger = useLedgerData();
  const note = ledger.notes.find((n) => n.id === id);
  if (!note) return <NotFoundPage />;
  return <NoteDetail key={note.id} note={note} ledger={ledger} />;
}

function NoteDetail({ note, ledger }: { note: Note; ledger: LedgerState }) {
  const send = useCommand();
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title ?? "");
  const [body, setBody] = useState(note.body);
  const [theirs, setTheirs] = useState<Note | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [reply, setReply] = useState("");
  const account = findAccount(ledger, note.accountId);
  const plan = ledger.plans.find((p) => p.id === note.planId);
  const mine = note.authorId === me.id;
  const isQuestion = note.kind === "question";

  const saveEdit = async (expectedVersion: number) => {
    if (!body.trim()) return;
    const res = await send(
      {
        type: "note.update",
        id: note.id,
        expectedVersion,
        patch: { title: title.trim() || undefined, body: body.trim() },
      },
      { successMessage: "Saved. The earlier wording is kept in the history.", onConflict: (c) => setTheirs(c as Note) },
    );
    if (res) {
      setEditing(false);
      setTheirs(null);
    }
  };

  return (
    <div>
      <PageHeader
        back="/notes"
        title={note.title || (isQuestion ? "Question" : "Note")}
        subtitle={`${memberName(ledger, note.authorId)} · ${formatDateTime(note.createdAt)}`}
      />
      {note.archivedAt && <p className="mb-4 rounded-2xl bg-none-bg px-4 py-3 text-none-ink">This note is archived.</p>}

      <Card>
        <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-semibold text-muted">
          {isQuestion ? <CircleHelp aria-hidden className="size-4" /> : <StickyNote aria-hidden className="size-4" />}
          {isQuestion
            ? note.resolvedAt
              ? `Question · answered by ${memberName(ledger, note.resolvedBy)}`
              : "Question · not answered yet"
            : "Note"}
          {note.pinned && <span className="text-accent">· Pinned</span>}
        </p>

        {editing ? (
          <form
            className="mt-3 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit(note.version);
            }}
          >
            {theirs && (
              <div role="alert" className="rounded-xl bg-est-bg p-4 text-est-ink">
                <p className="font-semibold">
                  {memberName(ledger, theirs.updatedBy)} changed this while you were editing
                </p>
                <p className="mt-1 whitespace-pre-line text-[0.9375rem]">Their version: “{theirs.body}”</p>
                <Button className="mt-3" size="sm" onClick={() => void saveEdit(theirs.version)}>
                  Apply my changes again
                </Button>
              </div>
            )}
            <Field label="Title" optional>
              {({ id }) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />}
            </Field>
            <Field label="Words">
              {({ id }) => <Textarea id={id} rows={6} value={body} onChange={(e) => setBody(e.target.value)} />}
            </Field>
            <div className="flex gap-2">
              <Button type="submit">Save</Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-3 text-[1.0625rem] leading-relaxed whitespace-pre-line">{note.body}</p>
        )}

        {(account || plan) && (
          <p className="mt-4 text-[0.9375rem]">
            {account && (
              <>
                About{" "}
                <Link to={`/accounts/${account.id}`} className="font-semibold text-accent">
                  {account.displayName}
                </Link>
              </>
            )}
            {account && plan && " · "}
            {plan && (
              <>
                Plan:{" "}
                <Link to={`/plans/${plan.id}`} className="font-semibold text-accent">
                  {plan.title}
                </Link>
              </>
            )}
          </p>
        )}
        {account?.maturityDate && /matur|renew/i.test(note.body) && (
          <p className="mt-3 rounded-xl bg-cream px-4 py-3 text-[0.9375rem] text-muted">
            This is a note — what someone thinks. The account's maturity date is{" "}
            {account.maturityDateConfirmed ? "confirmed" : "not confirmed yet"}.
          </p>
        )}

        {note.history.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowHistory((s) => !s)}
              aria-expanded={showHistory}
              className="min-h-11 font-semibold text-accent"
            >
              {showHistory ? "Hide earlier versions" : `See earlier versions (${note.history.length})`}
            </button>
            {showHistory && (
              <ul className="mt-2 space-y-2 rounded-xl bg-cream p-3 text-[0.9375rem]">
                {[...note.history].reverse().map((h, i) => (
                  <li key={i}>
                    <span className="text-muted">
                      {formatDateTime(h.editedAt)} · {memberName(ledger, h.editedBy)}:
                    </span>{" "}
                    <span className="whitespace-pre-line">{h.body}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-2 border-t border-line pt-4 sm:grid-cols-2">
          {mine && !editing && !note.archivedAt && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil aria-hidden className="size-4" /> Edit
            </Button>
          )}
          {isQuestion && !note.archivedAt && (
            <Button
              variant="secondary"
              onClick={() =>
                void send(
                  { type: "note.resolve", id: note.id, resolved: !note.resolvedAt },
                  { successMessage: note.resolvedAt ? "Question reopened." : "Marked as answered." },
                )
              }
            >
              <CircleCheck aria-hidden className="size-4" /> {note.resolvedAt ? "Reopen question" : "Mark as answered"}
            </Button>
          )}
          {!note.archivedAt && (
            <Button
              variant="secondary"
              onClick={() =>
                void send(
                  { type: "note.update", id: note.id, expectedVersion: note.version, patch: { pinned: !note.pinned } },
                  { successMessage: note.pinned ? "Unpinned." : "Pinned to the top." },
                )
              }
            >
              {note.pinned ? <PinOff aria-hidden className="size-4" /> : <Pin aria-hidden className="size-4" />}
              {note.pinned ? "Unpin" : "Pin to top"}
            </Button>
          )}
          {note.archivedAt ? (
            <Button
              variant="secondary"
              onClick={() => void send({ type: "note.restore", id: note.id }, { successMessage: "Note brought back." })}
            >
              <ArchiveRestore aria-hidden className="size-4" /> Bring it back
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setArchiveOpen(true)}>
              <Archive aria-hidden className="size-4" /> Archive
            </Button>
          )}
        </div>
      </Card>

      <SectionTitle>Replies</SectionTitle>
      {note.comments.length === 0 && <p className="px-1 text-muted">No replies yet.</p>}
      <ul className="space-y-3">
        {note.comments.map((c) => (
          <ReplyItem key={c.id} comment={c} note={note} ledger={ledger} mine={c.authorId === me.id} />
        ))}
      </ul>
      {!note.archivedAt && (
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reply.trim()) return;
            const res = await send(
              { type: "note.comment", noteId: note.id, body: reply.trim() },
              { successMessage: "Reply added." },
            );
            if (res) setReply("");
          }}
        >
          <Field label={isQuestion ? "Your answer or reply" : "Your reply"}>
            {({ id }) => <Textarea id={id} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />}
          </Field>
          <Button type="submit" block disabled={!reply.trim()}>
            Add reply
          </Button>
        </form>
      )}

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive this note?"
        body={
          <p>
            It will be hidden from the notes list. Nothing is deleted — you can bring it back any time from Archived.
          </p>
        }
        confirmLabel="Archive note"
        onConfirm={async () => {
          await send(
            { type: "note.archive", id: note.id },
            { successMessage: "Note archived. You can bring it back from Archived." },
          );
          setArchiveOpen(false);
        }}
      />
    </div>
  );
}

function ReplyItem({
  comment,
  note,
  ledger,
  mine,
}: {
  comment: Comment;
  note: Note;
  ledger: LedgerState;
  mine: boolean;
}) {
  const send = useCommand();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [showHistory, setShowHistory] = useState(false);
  return (
    <li className="rounded-2xl border border-line bg-card p-4 shadow-card">
      <p className="text-[0.9375rem]">
        <span className="font-semibold">{memberName(ledger, comment.authorId)}</span>
        <span className="text-muted"> · {formatDateTime(comment.createdAt)}</span>
        {comment.editedAt && (
          <>
            <span className="text-muted"> · </span>
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
              { type: "note.editComment", noteId: note.id, commentId: comment.id, body: draft.trim() },
              { successMessage: "Reply updated. The earlier wording is kept." },
            );
            if (res) setEditing(false);
          }}
        >
          <Textarea aria-label="Edit your reply" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
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
        <p className="mt-1 whitespace-pre-line">{comment.body}</p>
      )}
      {showHistory && comment.history.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-xl bg-cream p-3 text-[0.9375rem]">
          {comment.history.map((h, i) => (
            <li key={i}>
              <span className="text-muted">{formatDateTime(h.editedAt)}: </span>
              {h.body}
            </li>
          ))}
        </ul>
      )}
      {mine && !editing && (
        <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setEditing(true)}>
          <Pencil aria-hidden className="size-4" /> Edit my reply
        </Button>
      )}
    </li>
  );
}
