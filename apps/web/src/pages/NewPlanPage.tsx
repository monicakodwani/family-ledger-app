import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { PlanStatus } from "@family-ledger/shared";
import { useCommand, useLedgerData } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "../components/ui/field";
import { MoneyInput, readAmount } from "../components/MoneyInput";
import { PLAN_STATUS_LABELS, PLAN_STATUS_ORDER } from "../lib/labels";
import { t } from "../i18n";

export default function NewPlanPage() {
  const ledger = useLedgerData();
  const send = useCommand();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<PlanStatus>("idea");
  const [targetDate, setTargetDate] = useState("");
  const [budget, setBudget] = useState("");
  const [related, setRelated] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please give the plan a title");
      return;
    }
    const budgetMinor = budget.trim() ? readAmount(budget).minor : undefined;
    if (budget.trim() && !budgetMinor) return;
    setSaving(true);
    const res = await send(
      {
        type: "plan.create",
        data: {
          title: title.trim(),
          category: category.trim() || undefined,
          description: description.trim() || undefined,
          status,
          targetDate: targetDate || undefined,
          budgetMinor: budgetMinor ?? undefined,
          relatedAccountIds: related,
        },
      },
      { successMessage: "Plan started. Everyone in the family can see it and join in." },
    );
    setSaving(false);
    if (res) navigate(`/plans/${res.entityId}`, { replace: true });
  };

  return (
    <div>
      <PageHeader title={t("page.newPlan")} back="/plans" subtitle="Only the title is required." />
      <form onSubmit={(e) => void submit(e)} className="space-y-6" noValidate>
        <Field
          label="What's the plan?"
          hint="For example “Save for a wedding” or “Renovate the kitchen”."
          error={error}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              autoFocus
              value={title}
              maxLength={140}
              onChange={(e) => setTitle(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>
        <Field label="Describe it" optional>
          {({ id }) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        {!more ? (
          <Button variant="ghost" onClick={() => setMore(true)}>
            Add more details (optional)
          </Button>
        ) : (
          <>
            <Field label="Kind of plan" hint="For example: travel, education." optional>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  value={category}
                  maxLength={60}
                  onChange={(e) => setCategory(e.target.value)}
                  aria-describedby={describedBy}
                />
              )}
            </Field>
            <Field label="Where is it now?">
              {({ id }) => (
                <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)}>
                  {PLAN_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {PLAN_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Target date" optional>
              {({ id }) => (
                <Input id={id} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              )}
            </Field>
            <MoneyInput label="Budget (optional)" value={budget} onChange={setBudget} />
            <fieldset className="space-y-2">
              <legend className="mb-1.5 font-semibold">Related accounts (optional)</legend>
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
          </>
        )}
        <Button type="submit" size="lg" block disabled={saving}>
          {saving ? "Saving…" : "Start this plan"}
        </Button>
      </form>
    </div>
  );
}
