import { z } from "zod";
import { isMinorUnits } from "./money";
import { isSafeExternalUrl } from "./urls";

/**
 * Versioned data model for Family Ledger. See docs/DATA_MODEL.md.
 * Bump SCHEMA_VERSION and add a migration in migrations.ts for breaking changes.
 */
export const SCHEMA_VERSION = 1 as const;

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);
const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-31");
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).optional();
const minor = z.string().refine(isMinorUnits, "Invalid amount");
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .default("INR");
const safeUrl = z
  .string()
  .trim()
  .max(500)
  .refine(isSafeExternalUrl, "Use a full https:// address for an official website");

export const AssetClass = z.enum([
  "listed_equity",
  "mutual_funds",
  "managed_portfolio",
  "fixed_deposit",
  "savings",
  "provident_fund",
  "insurance_investment",
  "gold",
  "real_estate",
  "bonds",
  "cash",
  "other",
  "liability",
]);
export type AssetClass = z.infer<typeof AssetClass>;

export const Liquidity = z.enum(["liquid", "restricted", "locked", "unknown"]);
export type Liquidity = z.infer<typeof Liquidity>;

export const OwnershipStatus = z.enum(["confirmed", "unconfirmed", "disputed", "unknown"]);
export const AccountLifecycle = z.enum(["active", "closed", "unknown"]);

export const ValuationSource = z.enum(["statement", "app_or_website", "document", "conversation", "estimate", "sync"]);
export type ValuationSource = z.infer<typeof ValuationSource>;

/** Per-valuation confidence. Account-level status is derived (see calculations.ts). */
export const ValuationConfidence = z.enum(["estimated", "verified"]);

/** The six statuses shown to the family. Derived, never stored directly. */
export const VerificationStatus = z.enum([
  "not_entered",
  "estimated",
  "waiting_for_statement",
  "verified",
  "outdated",
  "conflicting",
]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const Member = z.object({
  id,
  personId: id,
  displayName: text(40).min(1),
  email: z.string().email().max(200).optional(),
  /** Bound on first verified sign-in. Never set from the client. */
  authUserId: z.string().max(100).optional(),
  status: z.enum(["active", "invited", "locked"]),
  createdAt: isoDateTime,
});
export type Member = z.infer<typeof Member>;

export const Person = z.object({
  id,
  name: text(80).min(1),
  relation: optText(80),
  memberId: id.optional(),
  phone: optText(40),
  email: optText(200),
  note: optText(500),
});
export type Person = z.infer<typeof Person>;

export const Valuation = z.object({
  id,
  amountMinor: minor,
  currency,
  valuationDate: isoDate,
  source: ValuationSource,
  sourceNote: optText(300),
  confidence: ValuationConfidence,
  enteredBy: id,
  enteredAt: isoDateTime,
  /** Set by the sync framework only; manual entries leave it empty. */
  provider: optText(60),
  /** A mistaken or rejected value stays in history but no longer counts. */
  setAside: z.object({ by: id, at: isoDateTime, note: optText(300) }).optional(),
});
export type Valuation = z.infer<typeof Valuation>;

export const Owner = z.object({
  personId: id,
  /** Decimal percentage string, e.g. "50" or "33.33"; only when confirmed. */
  sharePercent: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/)
    .optional(),
});

export const PasswordManagerLink = z.object({
  provider: z.enum(["none", "bitwarden", "1password", "other"]),
  /** A non-secret label or item reference, never a password. */
  itemReference: optText(120),
  itemUrl: safeUrl.optional(),
  instructions: optText(500),
});

export const Contact = z.object({
  id,
  name: text(80).min(1),
  role: optText(80),
  phone: optText(40),
  email: optText(200),
});

export const AccessDetails = z.object({
  officialWebsite: safeUrl.optional(),
  loginUrl: safeUrl.optional(),
  usernameHint: optText(120),
  registeredEmail: optText(200),
  registeredPhone: optText(40),
  otpDestination: optText(200),
  authenticator: z.enum(["yes", "no", "unknown"]).default("unknown"),
  passwordManager: PasswordManagerLink.optional(),
  statementInstructions: optText(1000),
  contacts: z.array(Contact).max(20).default([]),
});
export type AccessDetails = z.infer<typeof AccessDetails>;

export const ConflictFlag = z.object({
  valuationIds: z.array(id).min(2).max(10),
  note: optText(500),
  raisedBy: id,
  raisedAt: isoDateTime,
});

export const Account = z.object({
  id,
  version: z.number().int().nonnegative(),
  displayName: text(80).min(1),
  nickname: optText(80),
  institution: optText(120),
  assetClass: AssetClass,
  productTypeNote: optText(300),
  description: optText(2000),
  lifecycle: AccountLifecycle.default("active"),

  /** Explicit parent for holdings inside a portfolio/brokerage account. */
  parentId: id.optional(),
  /** True when this account's value is already counted in its parent's value. */
  includedInParentValue: z.boolean().default(false),

  ownership: z.object({
    status: OwnershipStatus.default("unknown"),
    owners: z.array(Owner).max(10).default([]),
    associatedPersonIds: z.array(id).max(10).default([]),
    note: optText(500),
  }),
  nominees: optText(500),
  managedByPersonId: id.optional(),
  managerNote: optText(300),
  authorisedAccess: optText(500),

  currency,
  valuations: z.array(Valuation).max(1000).default([]),
  awaitingStatement: z.boolean().default(false),
  conflict: ConflictFlag.optional(),
  originalInvestmentMinor: minor.optional(),
  contributionsNote: optText(1000),

  /** Liabilities only: the approved limit. Never subtracted from net worth. */
  creditLimitMinor: minor.optional(),
  /** For a liability, the asset securing it; for an asset, liabilities it secures. */
  linkedAccountIds: z.array(id).max(10).default([]),

  liquidity: Liquidity.default("unknown"),
  restrictions: optText(1000),
  maturityDate: isoDate.optional(),
  maturityDateConfirmed: z.boolean().default(false),
  interestDetails: optText(300),
  taxTreatment: optText(120),
  taxNotes: optText(1000),

  access: AccessDetails.default({}),

  createdBy: id,
  createdAt: isoDateTime,
  updatedBy: id,
  updatedAt: isoDateTime,
  archivedAt: isoDateTime.optional(),
  archivedBy: id.optional(),
});
export type Account = z.infer<typeof Account>;

export const EditRecord = z.object({
  body: text(5000),
  editedBy: id,
  editedAt: isoDateTime,
});

export const Comment = z.object({
  id,
  authorId: id,
  body: text(5000).min(1),
  createdAt: isoDateTime,
  editedAt: isoDateTime.optional(),
  history: z.array(EditRecord).max(100).default([]),
});
export type Comment = z.infer<typeof Comment>;

export const Note = z.object({
  id,
  version: z.number().int().nonnegative(),
  kind: z.enum(["note", "question"]),
  title: optText(140),
  body: text(5000).min(1),
  authorId: id,
  createdAt: isoDateTime,
  updatedBy: id,
  updatedAt: isoDateTime,
  history: z.array(EditRecord).max(200).default([]),
  pinned: z.boolean().default(false),
  resolvedAt: isoDateTime.optional(),
  resolvedBy: id.optional(),
  accountId: id.optional(),
  planId: id.optional(),
  comments: z.array(Comment).max(500).default([]),
  archivedAt: isoDateTime.optional(),
  archivedBy: id.optional(),
});
export type Note = z.infer<typeof Note>;

export const PlanStatus = z.enum([
  "idea",
  "discussing",
  "researching",
  "decided",
  "in_progress",
  "completed",
  "on_hold",
]);
export type PlanStatus = z.infer<typeof PlanStatus>;

/**
 * A plan's thread distinguishes proposals, discussion, decisions and actions.
 * Entries are never overwritten by other people; edits keep history.
 */
export const PlanEntryType = z.enum(["proposal", "discussion", "decision", "action_item"]);
export type PlanEntryType = z.infer<typeof PlanEntryType>;

export const PlanEntry = z.object({
  id,
  type: PlanEntryType,
  authorId: id,
  body: text(5000).min(1),
  createdAt: isoDateTime,
  editedAt: isoDateTime.optional(),
  history: z.array(EditRecord).max(100).default([]),
  /** Decisions only: members who explicitly said they agree. */
  agreedBy: z.array(id).max(20).default([]),
});
export type PlanEntry = z.infer<typeof PlanEntry>;

export const PlanTask = z.object({
  id,
  title: text(200).min(1),
  assigneePersonId: id.optional(),
  dueDate: isoDate.optional(),
  done: z.boolean().default(false),
  createdBy: id,
  createdAt: isoDateTime,
  doneBy: id.optional(),
  doneAt: isoDateTime.optional(),
});

export const Plan = z.object({
  id,
  version: z.number().int().nonnegative(),
  title: text(140).min(1),
  category: optText(60),
  description: optText(5000),
  status: PlanStatus,
  proposedBy: id,
  createdAt: isoDateTime,
  targetDate: isoDate.optional(),
  budgetMinor: minor.optional(),
  relatedAccountIds: z.array(id).max(50).default([]),
  entries: z.array(PlanEntry).max(1000).default([]),
  tasks: z.array(PlanTask).max(200).default([]),
  updatedBy: id,
  updatedAt: isoDateTime,
  archivedAt: isoDateTime.optional(),
  archivedBy: id.optional(),
});
export type Plan = z.infer<typeof Plan>;

export const CheckItem = z.object({
  id,
  version: z.number().int().nonnegative(),
  title: text(200).min(1),
  detail: optText(1000),
  accountId: id.optional(),
  createdBy: id,
  createdAt: isoDateTime,
  doneAt: isoDateTime.optional(),
  doneBy: id.optional(),
  doneNote: optText(500),
  archivedAt: isoDateTime.optional(),
});
export type CheckItem = z.infer<typeof CheckItem>;

/** Index entry only. File uploads are disabled until encrypted storage exists. */
export const DocumentRef = z.object({
  id,
  version: z.number().int().nonnegative(),
  title: text(140).min(1),
  kind: z.enum(["statement", "certificate", "policy", "agreement", "id_proof", "tax", "other"]),
  whereKept: optText(300),
  documentDate: isoDate.optional(),
  accountIds: z.array(id).max(20).default([]),
  note: optText(1000),
  addedBy: id,
  addedAt: isoDateTime,
  archivedAt: isoDateTime.optional(),
});
export type DocumentRef = z.infer<typeof DocumentRef>;

export const LedgerState = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  revision: z.number().int().nonnegative(),
  baseCurrency: currency,
  members: z.array(Member).max(20),
  people: z.array(Person).max(200),
  accounts: z.array(Account).max(500),
  plans: z.array(Plan).max(500),
  notes: z.array(Note).max(2000),
  checks: z.array(CheckItem).max(1000),
  documents: z.array(DocumentRef).max(1000),
  updatedAt: isoDateTime,
});
export type LedgerState = z.infer<typeof LedgerState>;

export const FieldChange = z.object({
  field: z.string().max(80),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});
export type FieldChange = z.infer<typeof FieldChange>;

export const AuditEntry = z.object({
  id,
  seq: z.number().int().nonnegative(),
  at: isoDateTime,
  actorId: id,
  category: z.enum(["record", "security"]),
  action: z.string().max(60),
  entityType: z.string().max(30).optional(),
  entityId: id.optional(),
  entityLabel: optText(140),
  summary: text(400),
  changes: z.array(FieldChange).max(100).default([]),
  reason: optText(500),
  /** Hash chain: sha256(prevHash + canonical entry). Detects edits outside the app. */
  prevHash: z.string().max(128),
  hash: z.string().max(128),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const schemas = { id, isoDate, isoDateTime, minor, safeUrl, text, optText };
