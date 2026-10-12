import { useState } from "react";
import { Link } from "react-router";
import { CircleCheck, CircleHelp, Pin, Plus, Search, StickyNote } from "lucide-react";
import type { LedgerState, Note } from "@family-ledger/shared";
import { useLedgerData } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/card";
import { Input, Segmented } from "../components/ui/field";
import { formatDay, memberName } from "../lib/format";
import { findAccount } from "../lib/ledger";
import { t } from "../i18n";

type Filter = "all" | "questions" | "pinned" | "archived";

export function NoteCard({ note, ledger }: { note: Note; ledger: LedgerState }) {
  const account = findAccount(ledger, note.accountId);
  const plan = ledger.plans.find((p) => p.id === note.planId);
  const Icon = note.kind === "question" ? (note.resolvedAt ? CircleCheck : CircleHelp) : StickyNote;
  return (
    <Link
      to={`/notes/${note.id}`}
      className="block rounded-2xl border border-line bg-card p-4 text-ink no-underline shadow-card hover:border-line-strong"
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.875rem] font-semibold text-muted">
        <Icon aria-hidden className="size-4" />
        {note.kind === "question" ? (note.resolvedAt ? "Question · answered" : "Question") : "Note"}
        {note.pinned && (
          <span className="inline-flex items-center gap-1 text-accent">
            <Pin aria-hidden className="size-3.5" /> Pinned
          </span>
        )}
        <span>
          · {memberName(ledger, note.authorId)} · {formatDay(note.createdAt)}
        </span>
      </p>
      {note.title && <p className="mt-1.5 font-semibold">{note.title}</p>}
      <p className="mt-1 line-clamp-3 leading-relaxed">{note.body}</p>
      {(account || plan || note.comments.length > 0) && (
        <p className="mt-2 text-[0.9375rem] text-muted">
          {[
            account && `About ${account.displayName}`,
            plan && `Plan: ${plan.title}`,
            note.comments.length ? `${note.comments.length} ${note.comments.length === 1 ? "reply" : "replies"}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </Link>
  );
}

export default function NotesPage() {
  const ledger = useLedgerData();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const s = q.trim().toLowerCase();
  const notes = ledger.notes
    .filter((n) => (filter === "archived" ? n.archivedAt : !n.archivedAt))
    .filter((n) => filter !== "questions" || n.kind === "question")
    .filter((n) => filter !== "pinned" || n.pinned)
    .filter((n) => !s || [n.title, n.body, ...n.comments.map((c) => c.body)].some((f) => f?.toLowerCase().includes(s)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.updatedAt < b.updatedAt ? 1 : -1));

  return (
    <div>
      <PageHeader
        title={t("page.notes")}
        back="/more"
        action={
          <Button asChild size="sm">
            <Link to="/notes/new">
              <Plus aria-hidden className="size-5" /> New
            </Link>
          </Button>
        }
      />
      <div className="space-y-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            aria-label="Search notes"
            placeholder="Search notes"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-12"
          />
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "questions", label: "Questions" },
            { value: "pinned", label: "Pinned" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </div>
      <div className="mt-5 space-y-3">
        {notes.length === 0 ? (
          <EmptyState
            icon={<StickyNote aria-hidden className="size-6" />}
            title={s ? "No notes match your search" : "No notes here yet"}
          />
        ) : (
          notes.map((n) => <NoteCard key={n.id} note={n} ledger={ledger} />)
        )}
      </div>
    </div>
  );
}
