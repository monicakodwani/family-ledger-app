import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CircleHelp, StickyNote } from "lucide-react";
import { useCommand, useLedgerData } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Checkbox, ChoiceGroup, Field, Input, Select, Textarea } from "../components/ui/field";
import { t } from "../i18n";

export default function NewNotePage() {
  const ledger = useLedgerData();
  const send = useCommand();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [kind, setKind] = useState<"note" | "question">("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [accountId, setAccountId] = useState(params.get("accountId") ?? "");
  const [planId, setPlanId] = useState(params.get("planId") ?? "");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) {
      setError("Please write something first");
      return;
    }
    setSaving(true);
    const res = await send({
      type: "note.create",
      data: {
        kind,
        title: title.trim() || undefined,
        body: body.trim(),
        pinned,
        accountId: accountId || undefined,
        planId: planId || undefined,
      },
    });
    setSaving(false);
    if (res) navigate(`/notes/${res.entityId}`, { replace: true });
  };

  return (
    <div>
      <PageHeader title={t("page.newNote")} back />
      <form onSubmit={(e) => void submit(e)} className="space-y-6" noValidate>
        <ChoiceGroup
          name="kind"
          legend="What is it?"
          value={kind}
          onChange={setKind}
          columns={2}
          options={[
            { value: "note", label: "A note", icon: <StickyNote aria-hidden className="size-5" /> },
            { value: "question", label: "A question", icon: <CircleHelp aria-hidden className="size-5" /> },
          ]}
        />
        <Field label="Title" optional>
          {({ id }) => <Input id={id} value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field
          label={kind === "question" ? "Your question" : "Your note"}
          hint="If you haven't checked it, say so."
          error={error}
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              autoFocus
            />
          )}
        </Field>
        <Field label="About an account" optional>
          {({ id }) => (
            <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">General — not about one account</option>
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
        <Field label="About a plan" optional>
          {({ id }) => (
            <Select id={id} value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">No plan</option>
              {ledger.plans
                .filter((p) => !p.archivedAt)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Checkbox label="Pin it to the top" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        <Button type="submit" size="lg" block disabled={saving}>
          {saving ? "Saving…" : t("action.save")}
        </Button>
      </form>
    </div>
  );
}
