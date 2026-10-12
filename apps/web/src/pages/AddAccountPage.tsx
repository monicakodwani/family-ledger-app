import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { ArrowRight } from "lucide-react";
import type { AssetClass, Liquidity } from "@family-ledger/shared";
import { useCommand, useLedgerData } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "../components/ui/field";
import { MoneyInput, readAmount } from "../components/MoneyInput";
import { ASSET_CLASS_TILES } from "../lib/labels";
import { cn } from "../lib/cn";
import { t } from "../i18n";

export default function AddAccountPage() {
  const ledger = useLedgerData();
  const send = useCommand();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [assetClass, setAssetClass] = useState<AssetClass | null>(null);
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [people, setPeople] = useState<string[]>([]);
  const [managedBy, setManagedBy] = useState("");
  const [liquidity, setLiquidity] = useState<Liquidity>("unknown");
  const [description, setDescription] = useState("");
  const [limit, setLimit] = useState("");
  const [maturity, setMaturity] = useState("");
  const [saving, setSaving] = useState(false);

  const tile = ASSET_CLASS_TILES.find((t) => t.value === assetClass);

  const save = async () => {
    if (!assetClass) return;
    if (!name.trim()) {
      setStep(2);
      setNameError("Please enter a name.");
      return;
    }
    setSaving(true);
    const limitMinor = assetClass === "liability" ? readAmount(limit).minor : null;
    const res = await send(
      {
        type: "account.create",
        data: {
          displayName: name.trim(),
          assetClass,
          institution: institution.trim() || undefined,
          description: description.trim() || undefined,
          liquidity,
          managedByPersonId: managedBy || undefined,
          ownership: { status: "unconfirmed", owners: [], associatedPersonIds: people },
          creditLimitMinor: limitMinor ?? undefined,
          maturityDate: maturity || undefined,
          maturityDateConfirmed: false,
        },
      },
      { successMessage: "Account added. Everyone in the family can see it now." },
    );
    setSaving(false);
    if (res) navigate(`/accounts/${res.entityId}`, { replace: true });
  };

  const next = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Please enter a name.");
      return;
    }
    setNameError(undefined);
    setStep(3);
  };

  return (
    <div>
      <PageHeader title={t("page.addAccount")} back="/accounts" subtitle={`Step ${step} of 3`} />

      {step === 1 && (
        <fieldset>
          <legend className="mb-3 text-xl font-semibold">What kind of account is it?</legend>
          <div className="grid grid-cols-2 gap-3">
            {ASSET_CLASS_TILES.map(({ value, label, hint, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setAssetClass(value);
                  setStep(2);
                }}
                className={cn(
                  "flex min-h-32 flex-col items-start gap-2 rounded-2xl border bg-card p-4 text-left shadow-card transition-colors hover:border-accent",
                  assetClass === value ? "border-accent ring-2 ring-accent/30" : "border-line",
                )}
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon aria-hidden className="size-6" />
                </span>
                <span className="font-semibold leading-snug">{label}</span>
                <span className="text-[0.875rem] leading-snug text-muted">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {step === 2 && tile && (
        <form onSubmit={next} className="space-y-5">
          <Card className="flex items-center gap-3 p-4">
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <tile.icon aria-hidden className="size-6" />
            </span>
            <span className="flex-1 font-semibold">{tile.label}</span>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              Change
            </Button>
          </Card>
          <Field label="What do we call it?" hint="For example “Chandra's SBI savings”." error={nameError}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                maxLength={80}
              />
            )}
          </Field>
          <Field label="Where is this money?" hint="Bank, broker or app." optional>
            {({ id, describedBy }) => (
              <Input
                id={id}
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                aria-describedby={describedBy}
                maxLength={120}
              />
            )}
          </Field>
          <div className="flex flex-col gap-3 pt-2">
            <Button type="submit" size="lg" block>
              Next: a few optional details <ArrowRight aria-hidden className="size-5" />
            </Button>
            <Button variant="secondary" size="lg" block onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save now, add details later"}
            </Button>
          </div>
        </form>
      )}

      {step === 3 && assetClass && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-6"
        >
          <p className="text-muted">All fields are optional.</p>
          <fieldset className="space-y-2">
            <legend className="mb-1.5 font-semibold">Who is it linked to?</legend>
            <p className="-mt-1 mb-2 text-[0.9375rem] text-muted">
              Tick anyone it belongs to or is connected with. You can confirm exact ownership later.
            </p>
            {ledger.people.map((p) => (
              <Checkbox
                key={p.id}
                label={p.name}
                hint={p.memberId ? undefined : p.relation}
                checked={people.includes(p.id)}
                onChange={(e) =>
                  setPeople((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))
                }
              />
            ))}
          </fieldset>
          <Field label="Does someone manage it for us?" optional>
            {({ id }) => (
              <Select id={id} value={managedBy} onChange={(e) => setManagedBy(e.target.value)}>
                <option value="">No — the family manages it</option>
                {ledger.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {assetClass !== "liability" && (
            <Field label="Can the money be withdrawn easily?" optional>
              {({ id }) => (
                <Select id={id} value={liquidity} onChange={(e) => setLiquidity(e.target.value as Liquidity)}>
                  <option value="unknown">Not sure yet</option>
                  <option value="liquid">Yes, easily</option>
                  <option value="restricted">With some restrictions</option>
                  <option value="locked">Locked until a date or event</option>
                </Select>
              )}
            </Field>
          )}
          {assetClass === "liability" && (
            <MoneyInput
              label="Approved limit (optional)"
              hint="For an overdraft or credit line: the limit the bank allows. This is not money borrowed."
              value={limit}
              onChange={setLimit}
            />
          )}
          {(assetClass === "fixed_deposit" || assetClass === "insurance_investment" || assetClass === "bonds") && (
            <Field label="Maturity date" hint="Only if you know it. You can mark it as confirmed later." optional>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="date"
                  value={maturity}
                  onChange={(e) => setMaturity(e.target.value)}
                  aria-describedby={describedBy}
                />
              )}
            </Field>
          )}
          <Field label="Anything else to remember?" optional>
            {({ id }) => (
              <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
            )}
          </Field>
          <div className="flex flex-col gap-3">
            <Button type="submit" size="lg" block disabled={saving}>
              {saving ? "Saving…" : t("action.save")}
            </Button>
            <Button variant="ghost" size="lg" block onClick={() => setStep(2)}>
              {t("action.back")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
