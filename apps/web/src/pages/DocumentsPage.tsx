import { useState } from "react";
import { Link } from "react-router";
import { FileText, Plus, UploadCloud } from "lucide-react";
import type { DocumentRef } from "@family-ledger/shared";
import { useCommand, useLedgerData } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Card, EmptyState } from "../components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "../components/ui/field";
import { ConfirmDialog, Sheet } from "../components/ui/dialog";
import { DOCUMENT_KIND_LABELS } from "../lib/labels";
import { formatDate, memberName } from "../lib/format";
import { findAccount } from "../lib/ledger";
import { t } from "../i18n";

type Kind = DocumentRef["kind"];

export default function DocumentsPage() {
  const ledger = useLedgerData();
  const send = useCommand();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Kind>("statement");
  const [whereKept, setWhereKept] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [accounts, setAccounts] = useState<string[]>([]);
  const [removing, setRemoving] = useState<DocumentRef | null>(null);
  const docs = ledger.documents.filter((d) => !d.archivedAt);

  return (
    <div>
      <PageHeader
        title={t("page.documents")}
        back="/more"
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus aria-hidden className="size-5" /> Add
          </Button>
        }
      />
      <Card className="mb-5 flex items-start gap-3 bg-cream-deep shadow-none">
        <UploadCloud aria-hidden className="mt-0.5 size-6 shrink-0 text-muted" />
        <p>
          Uploading files is switched off until encrypted file storage is ready. For now, note where the paper or file
          is kept.
        </p>
      </Card>
      {docs.length === 0 ? (
        <EmptyState icon={<FileText aria-hidden className="size-6" />} title="No documents listed yet" />
      ) : (
        <ul className="space-y-3">
          {docs.map((d) => (
            <li key={d.id} className="rounded-2xl border border-line bg-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <FileText aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{d.title}</p>
                  <p className="text-[0.9375rem] text-muted">
                    {DOCUMENT_KIND_LABELS[d.kind]}
                    {d.documentDate ? ` · ${formatDate(d.documentDate)}` : ""} · listed by{" "}
                    {memberName(ledger, d.addedBy)}
                  </p>
                  <p className="mt-2">
                    <span className="text-muted">Kept: </span>
                    {d.whereKept || "Not noted yet"}
                  </p>
                  {d.accountIds.length > 0 && (
                    <p className="mt-1 text-[0.9375rem]">
                      {d.accountIds.map((aid, i) => {
                        const a = findAccount(ledger, aid);
                        return a ? (
                          <span key={aid}>
                            {i > 0 && ", "}
                            <Link to={`/accounts/${aid}`} className="font-semibold text-accent">
                              {a.displayName}
                            </Link>
                          </span>
                        ) : null;
                      })}
                    </p>
                  )}
                  {d.note && <p className="mt-1 text-[0.9375rem] text-muted">{d.note}</p>}
                  <Button variant="ghost" size="sm" className="mt-1 -ml-3" onClick={() => setRemoving(d)}>
                    Remove from list
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="List a document"
        description="Record what the document is and where it is kept. No file is uploaded."
      >
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            const res = await send({
              type: "document.create",
              data: {
                title: title.trim(),
                kind,
                whereKept: whereKept.trim() || undefined,
                documentDate: date || undefined,
                note: note.trim() || undefined,
                accountIds: accounts,
              },
            });
            if (res) {
              setOpen(false);
              setTitle("");
              setWhereKept("");
              setDate("");
              setNote("");
              setAccounts([]);
            }
          }}
        >
          <Field label="What is it?">
            {({ id }) => (
              <Input
                id={id}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. FD certificate"
                maxLength={140}
              />
            )}
          </Field>
          <Field label="Kind">
            {({ id }) => (
              <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {Object.entries(DOCUMENT_KIND_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Where is it kept?" hint="e.g. Blue file in the bedroom cupboard">
            {({ id, describedBy }) => (
              <Input
                id={id}
                value={whereKept}
                onChange={(e) => setWhereKept(e.target.value)}
                aria-describedby={describedBy}
                maxLength={300}
              />
            )}
          </Field>
          <Field label="Date on the document" optional>
            {({ id }) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <fieldset className="space-y-2">
            <legend className="mb-1.5 font-semibold">Related accounts (optional)</legend>
            {ledger.accounts
              .filter((a) => !a.archivedAt)
              .map((a) => (
                <Checkbox
                  key={a.id}
                  label={a.displayName}
                  checked={accounts.includes(a.id)}
                  onChange={(e) =>
                    setAccounts((cur) => (e.target.checked ? [...cur, a.id] : cur.filter((x) => x !== a.id)))
                  }
                />
              ))}
          </fieldset>
          <Field label="Note" optional>
            {({ id }) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <Button type="submit" size="lg" block disabled={!title.trim()}>
            Save
          </Button>
        </form>
      </Sheet>
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove from the list?"
        body={<p>This only removes the entry from this list. It's kept in the history.</p>}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (removing)
            await send({ type: "document.archive", id: removing.id }, { successMessage: "Removed from the list." });
          setRemoving(null);
        }}
      />
    </div>
  );
}
