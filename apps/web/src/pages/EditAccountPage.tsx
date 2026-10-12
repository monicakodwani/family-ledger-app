import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { useFieldArray, useForm, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, Plus, Trash2, Users } from "lucide-react";
import {
  AssetClass,
  isSafeExternalUrl,
  parseRupeesInput,
  type AccessDetails,
  type Account,
  type AccountPatch,
  type LedgerState,
} from "@family-ledger/shared";
import { useCommand, useLedgerData } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "../components/ui/field";
import { useReveal } from "../components/AccessSection";
import { readableValue } from "../components/ActivityItem";
import { ASSET_CLASS_TILES, LIFECYCLE_LABELS, OWNERSHIP_LABELS } from "../lib/labels";
import { findAccount } from "../lib/ledger";
import { formatDateTime, inr, memberName } from "../lib/format";
import { NotFoundPage } from "./NotFoundPage";
import { t } from "../i18n";

type PatchInput = z.infer<typeof AccountPatch>;

const str = (max: number) => z.string().max(max, `Please keep this under ${max} characters`);
const money = z
  .string()
  .refine((v) => !v.trim() || (parseRupeesInput(v) ?? "-").match(/^\d+$/), "We couldn't read that amount");
const url = z
  .string()
  .refine((v) => !v.trim() || isSafeExternalUrl(v.trim()), "Use a full https:// address, like https://www.sbi.co.in");

const FormSchema = z.object({
  displayName: z.string().trim().min(1, "Please give this account a name").max(80),
  nickname: str(80),
  institution: str(120),
  assetClass: AssetClass,
  productTypeNote: str(300),
  description: str(2000),
  lifecycle: z.enum(["active", "closed", "unknown"]),
  ownershipStatus: z.enum(["confirmed", "unconfirmed", "disputed", "unknown"]),
  people: z.array(
    z.object({
      personId: z.string(),
      role: z.enum(["none", "owner", "linked"]),
      share: z.string().refine((v) => !v.trim() || /^\d{1,3}(\.\d{1,2})?$/.test(v.trim()), "Use a number like 50"),
    }),
  ),
  ownershipNote: str(500),
  nominees: str(500),
  managedBy: z.string(),
  managerNote: str(300),
  authorisedAccess: str(500),
  originalInvestment: money,
  contributionsNote: str(1000),
  creditLimit: money,
  liquidity: z.enum(["liquid", "restricted", "locked", "unknown"]),
  restrictions: str(1000),
  maturityDate: z.string(),
  maturityDateConfirmed: z.boolean(),
  interestDetails: str(300),
  taxTreatment: str(120),
  taxNotes: str(1000),
  parentId: z.string(),
  includedInParentValue: z.boolean(),
  // Checkbox groups can report false / a single string; normalised in buildPatch.
  linked: z.union([z.array(z.string()), z.string(), z.boolean()]),
  officialWebsite: url,
  loginUrl: url,
  usernameHint: str(120),
  registeredEmail: str(200),
  registeredPhone: str(40),
  otpDestination: str(200),
  authenticator: z.enum(["yes", "no", "unknown"]),
  pmProvider: z.enum(["none", "bitwarden", "1password", "other"]),
  pmItemReference: str(120),
  pmItemUrl: url,
  pmInstructions: str(500),
  statementInstructions: str(1000),
  contacts: z.array(z.object({ id: z.string(), name: str(80), role: str(80), phone: str(40), email: str(200) })),
});
type FormValues = z.infer<typeof FormSchema>;

const o = (v: string) => (v.trim() ? v.trim() : undefined);
const minorToText = (m?: string) => (m ? (BigInt(m) / 100n).toString() : "");

function accessDefaults(a: AccessDetails) {
  return {
    officialWebsite: a.officialWebsite ?? "",
    loginUrl: a.loginUrl ?? "",
    usernameHint: a.usernameHint ?? "",
    registeredEmail: a.registeredEmail ?? "",
    registeredPhone: a.registeredPhone ?? "",
    otpDestination: a.otpDestination ?? "",
    authenticator: a.authenticator,
    pmProvider: a.passwordManager?.provider ?? "none",
    pmItemReference: a.passwordManager?.itemReference ?? "",
    pmItemUrl: a.passwordManager?.itemUrl ?? "",
    pmInstructions: a.passwordManager?.instructions ?? "",
    statementInstructions: a.statementInstructions ?? "",
    contacts: a.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
    })),
  } as const;
}

function defaults(account: Account, ledger: LedgerState): FormValues {
  return {
    displayName: account.displayName,
    nickname: account.nickname ?? "",
    institution: account.institution ?? "",
    assetClass: account.assetClass,
    productTypeNote: account.productTypeNote ?? "",
    description: account.description ?? "",
    lifecycle: account.lifecycle,
    ownershipStatus: account.ownership.status,
    people: ledger.people.map((p) => {
      const owner = account.ownership.owners.find((x) => x.personId === p.id);
      return {
        personId: p.id,
        role: owner ? "owner" : account.ownership.associatedPersonIds.includes(p.id) ? "linked" : "none",
        share: owner?.sharePercent ?? "",
      };
    }),
    ownershipNote: account.ownership.note ?? "",
    nominees: account.nominees ?? "",
    managedBy: account.managedByPersonId ?? "",
    managerNote: account.managerNote ?? "",
    authorisedAccess: account.authorisedAccess ?? "",
    originalInvestment: minorToText(account.originalInvestmentMinor),
    contributionsNote: account.contributionsNote ?? "",
    creditLimit: minorToText(account.creditLimitMinor),
    liquidity: account.liquidity,
    restrictions: account.restrictions ?? "",
    maturityDate: account.maturityDate ?? "",
    maturityDateConfirmed: account.maturityDateConfirmed,
    interestDetails: account.interestDetails ?? "",
    taxTreatment: account.taxTreatment ?? "",
    taxNotes: account.taxNotes ?? "",
    parentId: account.parentId ?? "",
    includedInParentValue: account.includedInParentValue,
    linked: account.linkedAccountIds,
    ...accessDefaults(account.access),
  } as FormValues;
}

function toAccess(v: FormValues): AccessDetails {
  return {
    officialWebsite: o(v.officialWebsite),
    loginUrl: o(v.loginUrl),
    usernameHint: o(v.usernameHint),
    registeredEmail: o(v.registeredEmail),
    registeredPhone: o(v.registeredPhone),
    otpDestination: o(v.otpDestination),
    authenticator: v.authenticator,
    passwordManager:
      v.pmProvider === "none" && !v.pmItemReference.trim() && !v.pmInstructions.trim()
        ? undefined
        : {
            provider: v.pmProvider,
            itemReference: o(v.pmItemReference),
            itemUrl: o(v.pmItemUrl),
            instructions: o(v.pmInstructions),
          },
    statementInstructions: o(v.statementInstructions),
    contacts: v.contacts
      .filter((c) => c.name.trim())
      .map((c) => ({ id: c.id, name: c.name.trim(), role: o(c.role), phone: o(c.phone), email: o(c.email) })),
  };
}

/** Only the fields that actually changed, so the history stays readable. */
export function buildPatch(v: FormValues, account: Account, revealed: AccessDetails | null): PatchInput {
  const next: PatchInput = {
    displayName: v.displayName.trim(),
    nickname: o(v.nickname),
    institution: o(v.institution),
    assetClass: v.assetClass,
    productTypeNote: o(v.productTypeNote),
    description: o(v.description),
    lifecycle: v.lifecycle,
    ownership: {
      status: v.ownershipStatus,
      owners: v.people
        .filter((p) => p.role === "owner")
        .map((p) =>
          p.share.trim() ? { personId: p.personId, sharePercent: p.share.trim() } : { personId: p.personId },
        ),
      associatedPersonIds: v.people.filter((p) => p.role === "linked").map((p) => p.personId),
      note: o(v.ownershipNote),
    },
    nominees: o(v.nominees),
    managedByPersonId: o(v.managedBy),
    managerNote: o(v.managerNote),
    authorisedAccess: o(v.authorisedAccess),
    originalInvestmentMinor: v.originalInvestment.trim()
      ? (parseRupeesInput(v.originalInvestment) ?? undefined)
      : undefined,
    contributionsNote: o(v.contributionsNote),
    creditLimitMinor: v.creditLimit.trim() ? (parseRupeesInput(v.creditLimit) ?? undefined) : undefined,
    liquidity: v.liquidity,
    restrictions: o(v.restrictions),
    maturityDate: o(v.maturityDate),
    maturityDateConfirmed: v.maturityDateConfirmed,
    interestDetails: o(v.interestDetails),
    taxTreatment: o(v.taxTreatment),
    taxNotes: o(v.taxNotes),
    parentId: o(v.parentId),
    includedInParentValue: v.parentId ? v.includedInParentValue : false,
    linkedAccountIds: Array.isArray(v.linked) ? v.linked : typeof v.linked === "string" ? [v.linked] : [],
  };
  const patch: Record<string, unknown> = {};
  const current = account as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(next)) {
    const before = key === "ownership" ? { ...account.ownership } : current[key];
    if (JSON.stringify(before ?? null) !== JSON.stringify(value ?? null)) patch[key] = value;
  }
  if (revealed) {
    const access = toAccess(v);
    if (JSON.stringify(access) !== JSON.stringify({ ...revealed, contacts: revealed.contacts ?? [] }))
      patch.access = access;
  }
  return patch as PatchInput;
}

const FIELD_NAMES: Record<string, string> = {
  displayName: "Name",
  institution: "Where the money is",
  ownership: "Who owns it",
  access: "Sign-in details",
  liquidity: "Can it be withdrawn?",
  maturityDate: "Maturity date",
  creditLimitMinor: "Approved limit",
  description: "About",
};

function Section({ title, children, description }: { title: string; children: ReactNode; description?: string }) {
  return (
    <section className="mt-8">
      <h2 className="mb-1 px-1 text-xl font-bold">{title}</h2>
      {description && <p className="mb-3 px-1 text-muted">{description}</p>}
      <Card className="space-y-5">{children}</Card>
    </section>
  );
}

function TextField({
  name,
  label,
  register,
  error,
  hint,
  multiline,
  type,
}: {
  name: keyof FormValues;
  label: string;
  register: UseFormRegister<FormValues>;
  error?: string;
  hint?: string;
  multiline?: boolean;
  type?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) =>
        multiline ? (
          <Textarea id={id} rows={3} aria-describedby={describedBy} aria-invalid={invalid} {...register(name)} />
        ) : (
          <Input id={id} type={type} aria-describedby={describedBy} aria-invalid={invalid} {...register(name)} />
        )
      }
    </Field>
  );
}

export default function EditAccountPage() {
  const { id } = useParams();
  const ledger = useLedgerData();
  const account = findAccount(ledger, id);
  if (!account) return <NotFoundPage />;
  return <EditAccountForm key={account.id} account={account} ledger={ledger} />;
}

function EditAccountForm({ account, ledger }: { account: Account; ledger: LedgerState }) {
  const send = useCommand();
  const navigate = useNavigate();
  const reveal = useReveal(account.id);
  const [revealedAccess, setRevealedAccess] = useState<AccessDetails | null>(null);
  const [base, setBase] = useState<Account>(account);
  const [conflict, setConflict] = useState<{ theirs: Account; patch: PatchInput } | null>(null);
  const initial = useMemo(() => defaults(account, ledger), [account, ledger]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema), defaultValues: initial });
  const contacts = useFieldArray({ control, name: "contacts" });
  const assetClass = watch("assetClass");
  const parentId = watch("parentId");
  const people = watch("people");

  const unlockAccess = async () => {
    const access = await reveal.reveal();
    if (!access) return;
    setRevealedAccess(access);
    const d = accessDefaults(access);
    (Object.keys(d) as Array<keyof typeof d>).forEach((k) => {
      if (k === "contacts") contacts.replace([...d.contacts]);
      else setValue(k, d[k] as never);
    });
  };

  const save = async (patch: PatchInput, expectedVersion: number) => {
    if (Object.keys(patch).length === 0) {
      navigate(`/accounts/${account.id}`);
      return;
    }
    const res = await send(
      { type: "account.update", id: account.id, expectedVersion, patch },
      {
        onConflict: (current) => {
          const theirs = current as Account | undefined;
          if (theirs && typeof theirs === "object" && "version" in theirs) setConflict({ theirs, patch });
        },
      },
    );
    if (res) navigate(`/accounts/${account.id}`, { replace: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    setConflict(null);
    await save(buildPatch(values, base, revealedAccess), base.version);
  });

  const others = ledger.accounts.filter((a) => a.id !== account.id && !a.archivedAt);

  return (
    <div>
      <PageHeader title={t("page.editAccount")} back={`/accounts/${account.id}`} subtitle={account.displayName} />

      {conflict && (
        <Card className="mb-6 border-est-line bg-est-bg" role="alert">
          <p className="flex items-center gap-2 text-lg font-bold text-est-ink">
            <Users aria-hidden className="size-5" /> {memberName(ledger, conflict.theirs.updatedBy)} changed this while
            you were editing
          </p>
          <p className="mt-1 text-est-ink">
            Their change was saved at {formatDateTime(conflict.theirs.updatedAt)}. Here's what's different for the
            fields you changed:
          </p>
          <dl className="mt-3 space-y-3 rounded-xl bg-card p-4">
            {Object.entries(conflict.patch).map(([field, mine]) => {
              const theirs = (conflict.theirs as unknown as Record<string, unknown>)[field];
              const fmt = (v: unknown) =>
                field === "access"
                  ? "Sign-in details (hidden)"
                  : field.endsWith("Minor") && typeof v === "string"
                    ? inr(v)
                    : readableValue(field, v);
              return (
                <div key={field}>
                  <dt className="font-semibold">{FIELD_NAMES[field] ?? field}</dt>
                  <dd className="text-[0.9375rem]">
                    <span className="text-muted">Now: </span>
                    {fmt(theirs)}
                  </dd>
                  <dd className="text-[0.9375rem]">
                    <span className="text-muted">Yours: </span>
                    {fmt(mine)}
                  </dd>
                </div>
              );
            })}
          </dl>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              onClick={() => {
                const theirs = conflict.theirs;
                setBase(theirs);
                setConflict(null);
                void save(conflict.patch, theirs.version);
              }}
            >
              Apply my changes again
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const theirs = conflict.theirs;
                setBase(theirs);
                setConflict(null);
                reset(defaults({ ...theirs, access: account.access }, ledger));
                setRevealedAccess(null);
              }}
            >
              Keep their version
            </Button>
          </div>
        </Card>
      )}

      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Section title="Basics">
          <TextField name="displayName" label="Name" register={register} error={errors.displayName?.message} />
          <TextField name="nickname" label="Also called" register={register} error={errors.nickname?.message} />
          <TextField
            name="institution"
            label="Where is this money?"
            hint="Bank, broker, app or place"
            register={register}
          />
          <Field label="Type">
            {({ id }) => (
              <Select id={id} {...register("assetClass")}>
                {ASSET_CLASS_TILES.map((tile) => (
                  <option key={tile.value} value={tile.value}>
                    {tile.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <TextField name="productTypeNote" label="What kind of product exactly?" register={register} multiline />
          <TextField name="description" label="About this account" register={register} multiline />
          <Field label="Is it still open?">
            {({ id }) => (
              <Select id={id} {...register("lifecycle")}>
                {Object.entries(LIFECYCLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </Section>

        <Section
          title="Who owns it"
          description="Only mark ownership as confirmed when the family has checked the papers."
        >
          <Field label="Ownership">
            {({ id }) => (
              <Select id={id} {...register("ownershipStatus")}>
                {Object.entries(OWNERSHIP_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <fieldset className="space-y-3">
            <legend className="mb-1 font-semibold">People</legend>
            {ledger.people.map((p, i) => (
              <div key={p.id} className="rounded-xl border border-line p-3">
                <Field label={p.name}>
                  {({ id }) => (
                    <Select id={id} {...register(`people.${i}.role` as const)}>
                      <option value="none">Not connected</option>
                      <option value="owner">In their name</option>
                      <option value="linked">Connected, not confirmed</option>
                    </Select>
                  )}
                </Field>
                {people[i]?.role === "owner" && (
                  <Field label="Their share (%)" optional error={errors.people?.[i]?.share?.message} className="mt-3">
                    {({ id, invalid }) => (
                      <Input
                        id={id}
                        inputMode="decimal"
                        aria-invalid={invalid}
                        {...register(`people.${i}.share` as const)}
                      />
                    )}
                  </Field>
                )}
              </div>
            ))}
          </fieldset>
          <TextField name="ownershipNote" label="Ownership note" register={register} multiline />
          <TextField name="nominees" label="Nominees" register={register} />
          <Field label="Managed by">
            {({ id }) => (
              <Select id={id} {...register("managedBy")}>
                <option value="">The family</option>
                {ledger.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <TextField name="managerNote" label="About the manager" register={register} />
          <TextField name="authorisedAccess" label="Who else has access" register={register} />
        </Section>

        <Section title="Money details">
          {assetClass === "liability" && (
            <TextField
              name="creditLimit"
              label="Approved limit (₹)"
              hint="The limit the bank allows — not money borrowed. You can type 25 lakh."
              register={register}
              error={errors.creditLimit?.message}
            />
          )}
          <TextField
            name="originalInvestment"
            label="Originally invested (₹)"
            hint="You can type 5 lakh"
            register={register}
            error={errors.originalInvestment?.message}
          />
          <TextField name="contributionsNote" label="Contributions" register={register} multiline />
          <Field label="Can the money be withdrawn easily?">
            {({ id }) => (
              <Select id={id} {...register("liquidity")}>
                <option value="unknown">Not sure yet</option>
                <option value="liquid">Yes, easily</option>
                <option value="restricted">With some restrictions</option>
                <option value="locked">Locked until a date or event</option>
              </Select>
            )}
          </Field>
          <TextField name="restrictions" label="Restrictions" register={register} multiline />
          <TextField name="maturityDate" label="Maturity date" type="date" register={register} />
          <Checkbox
            label="The maturity date is confirmed"
            hint="Tick only if checked on the certificate or statement."
            {...register("maturityDateConfirmed")}
          />
          <TextField name="interestDetails" label="Interest" register={register} />
          <TextField name="taxTreatment" label="Tax treatment" register={register} />
          <TextField name="taxNotes" label="Tax notes" register={register} multiline />
        </Section>

        <Section title="Connected accounts">
          <Field label="Is this a holding inside another account?">
            {({ id }) => (
              <Select id={id} {...register("parentId")}>
                <option value="">No</option>
                {others.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {parentId && (
            <Checkbox
              label="Its amount is already included in that account's amount"
              hint="Prevents counting the same money twice."
              {...register("includedInParentValue")}
            />
          )}
          <fieldset className="space-y-2">
            <legend className="mb-1 font-semibold">Linked accounts</legend>
            <p className="-mt-1 mb-2 text-[0.9375rem] text-muted">For example, the FD that secures an overdraft.</p>
            {others.map((a) => (
              <Checkbox key={a.id} label={a.displayName} value={a.id} {...register("linked")} />
            ))}
          </fieldset>
        </Section>

        <Section
          title="Sign-in & access"
          description="Passwords and OTPs are not stored here. Keep them in your password manager."
        >
          {!revealedAccess ? (
            <div className="text-center">
              <p className="text-muted">
                To change sign-in details, first show them. This needs a quick Face ID check.
              </p>
              <Button variant="secondary" className="mt-3" onClick={() => void unlockAccess()} disabled={reveal.busy}>
                <Eye aria-hidden className="size-5" /> Show details to edit
              </Button>
            </div>
          ) : (
            <>
              <TextField
                name="officialWebsite"
                label="Official website"
                hint="Must start with https://"
                register={register}
                error={errors.officialWebsite?.message}
              />
              <TextField name="loginUrl" label="Sign-in page" register={register} error={errors.loginUrl?.message} />
              <TextField name="usernameHint" label="Username or customer ID" register={register} />
              <TextField name="registeredEmail" label="Registered email" register={register} />
              <TextField name="registeredPhone" label="Registered phone" register={register} />
              <TextField name="otpDestination" label="OTP goes to" register={register} />
              <Field label="Uses an authenticator app?">
                {({ id }) => (
                  <Select id={id} {...register("authenticator")}>
                    <option value="unknown">Not sure</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </Select>
                )}
              </Field>
              <Field label="Password manager">
                {({ id }) => (
                  <Select id={id} {...register("pmProvider")}>
                    <option value="none">None</option>
                    <option value="bitwarden">Bitwarden</option>
                    <option value="1password">1Password</option>
                    <option value="other">Other</option>
                  </Select>
                )}
              </Field>
              <TextField name="pmItemReference" label="Name of the entry in the password manager" register={register} />
              <TextField
                name="pmItemUrl"
                label="Link to the entry"
                hint="Optional, https:// only"
                register={register}
                error={errors.pmItemUrl?.message}
              />
              <TextField name="pmInstructions" label="Instructions" register={register} multiline />
              <TextField name="statementInstructions" label="How to get a statement" register={register} multiline />
              <fieldset className="space-y-3">
                <legend className="mb-1 font-semibold">People to contact</legend>
                {contacts.fields.map((c, i) => (
                  <div key={c.id} className="space-y-3 rounded-xl border border-line p-3">
                    <Field label="Name">
                      {({ id }) => <Input id={id} {...register(`contacts.${i}.name` as const)} />}
                    </Field>
                    <Field label="Role" optional>
                      {({ id }) => <Input id={id} {...register(`contacts.${i}.role` as const)} />}
                    </Field>
                    <Field label="Phone" optional>
                      {({ id }) => <Input id={id} type="tel" {...register(`contacts.${i}.phone` as const)} />}
                    </Field>
                    <Field label="Email" optional>
                      {({ id }) => <Input id={id} type="email" {...register(`contacts.${i}.email` as const)} />}
                    </Field>
                    <Button variant="ghost" size="sm" onClick={() => contacts.remove(i)}>
                      <Trash2 aria-hidden className="size-4" /> Remove contact
                    </Button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  onClick={() =>
                    contacts.append({
                      id: `c_${crypto.randomUUID().slice(0, 8)}`,
                      name: "",
                      role: "",
                      phone: "",
                      email: "",
                    })
                  }
                >
                  <Plus aria-hidden className="size-4" /> Add a contact
                </Button>
              </fieldset>
            </>
          )}
        </Section>

        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 mt-8 -mx-4 bg-gradient-to-t from-cream via-cream to-transparent px-4 pt-6 pb-3">
          <Button type="submit" size="lg" block disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
