import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { BadgeCheck, PencilLine } from "lucide-react";
import { isLiability, todayIST, type ValuationSource } from "@family-ledger/shared";
import { useCommand, useLedgerData } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { ChoiceGroup, Field, Input, Textarea } from "../components/ui/field";
import { MoneyInput, readAmount } from "../components/MoneyInput";
import { findAccount } from "../lib/ledger";
import { SOURCE_CHOICES, SOURCE_LABELS } from "../lib/labels";
import { NotFoundPage } from "./NotFoundPage";
import { t } from "../i18n";

export default function UpdateAmountPage() {
  const { id } = useParams();
  const ledger = useLedgerData();
  const account = findAccount(ledger, id);
  const send = useCommand();
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIST());
  const [source, setSource] = useState<ValuationSource | undefined>();
  const [official, setOfficial] = useState<"yes" | "no" | undefined>();
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (!account) return <NotFoundPage />;
  const liability = isLiability(account);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { minor } = readAmount(amount);
    const next: Record<string, string> = {};
    if (!minor) next.amount = "Please enter the amount, for example 25 lakh.";
    else if (minor.startsWith("-")) next.amount = "Please enter the amount without a minus sign.";
    if (!date) next.date = "Please choose the date this amount is from.";
    else if (date > todayIST()) next.date = "The date can't be in the future.";
    if (!source) next.source = "Please choose where this number came from.";
    if (!official) next.official = "Please choose yes or no.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !minor || !source) return;
    setSaving(true);
    const res = await send({
      type: "valuation.add",
      accountId: account.id,
      valuation: {
        amountMinor: minor,
        valuationDate: date,
        source,
        sourceNote: note.trim() || undefined,
        confidence: official === "yes" ? "verified" : "estimated",
      },
    });
    setSaving(false);
    if (res) navigate(`/accounts/${account.id}`, { replace: true });
  };

  return (
    <div>
      <PageHeader title={t("page.updateAmount")} back={`/accounts/${account.id}`} subtitle={account.displayName} />
      <form onSubmit={(e) => void submit(e)} className="space-y-7" noValidate>
        <MoneyInput
          label={liability ? "How much is owed now?" : "How much is in it now?"}
          value={amount}
          onChange={setAmount}
          error={errors.amount}
          autoFocus
          name="amount"
        />
        <Field
          label="What date is this amount from?"
          hint="Usually today, or the date on the statement."
          error={errors.date}
        >
          {({ id: fid, describedBy, invalid }) => (
            <Input
              id={fid}
              type="date"
              value={date}
              max={todayIST()}
              onChange={(e) => setDate(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>
        <div>
          <ChoiceGroup
            name="source"
            legend="Where did this number come from?"
            value={source}
            onChange={(v) => {
              setSource(v);
              if (v === "statement" && !official) setOfficial("yes");
            }}
            options={SOURCE_CHOICES.map((s) => ({ value: s, label: SOURCE_LABELS[s] }))}
          />
          {errors.source && (
            <p role="alert" className="mt-2 font-medium text-con-ink">
              {errors.source}
            </p>
          )}
        </div>
        <div>
          <ChoiceGroup
            name="official"
            legend="Is this from an official statement?"
            hint="Only say yes if you're looking at a statement, certificate or the official app."
            value={official}
            onChange={setOfficial}
            options={[
              { value: "yes", label: "Yes — mark it verified", icon: <BadgeCheck aria-hidden className="size-5" /> },
              { value: "no", label: "No — it's an estimate", icon: <PencilLine aria-hidden className="size-5" /> },
            ]}
          />
          {errors.official && (
            <p role="alert" className="mt-2 font-medium text-con-ink">
              {errors.official}
            </p>
          )}
        </div>
        <Field label="A short note" hint="For example “From the September statement”." optional>
          {({ id: fid, describedBy }) => (
            <Textarea
              id={fid}
              rows={2}
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Button type="submit" size="lg" block disabled={saving}>
          {saving ? "Saving…" : t("action.save")}
        </Button>
      </form>
    </div>
  );
}
