import { z } from "zod";
import {
  Account,
  AccessDetails,
  AssetClass,
  CheckItem,
  DocumentRef,
  type FieldChange,
  type LedgerState,
  Liquidity,
  Note,
  OwnershipStatus,
  Owner,
  Person,
  Plan,
  PlanStatus,
  ValuationConfidence,
  ValuationSource,
  AccountLifecycle,
  schemas,
} from "./schema";
import { formatINRShort } from "./money";

const { id, isoDate, minor, text, optText } = schemas;

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

const AccountFields = z.object({
  displayName: text(80).min(1, "Please give this account a name"),
  nickname: optText(80),
  institution: optText(120),
  assetClass: AssetClass,
  productTypeNote: optText(300),
  description: optText(2000),
  lifecycle: AccountLifecycle,
  parentId: id.optional(),
  includedInParentValue: z.boolean(),
  ownership: z.object({
    status: OwnershipStatus,
    owners: z.array(Owner).max(10),
    associatedPersonIds: z.array(id).max(10),
    note: optText(500),
  }),
  nominees: optText(500),
  managedByPersonId: id.optional(),
  managerNote: optText(300),
  authorisedAccess: optText(500),
  currency: z.string().regex(/^[A-Z]{3}$/),
  originalInvestmentMinor: minor.optional(),
  contributionsNote: optText(1000),
  creditLimitMinor: minor.optional(),
  linkedAccountIds: z.array(id).max(10),
  liquidity: Liquidity,
  restrictions: optText(1000),
  maturityDate: isoDate.optional(),
  maturityDateConfirmed: z.boolean(),
  interestDetails: optText(300),
  taxTreatment: optText(120),
  taxNotes: optText(1000),
  access: AccessDetails,
});
export type AccountFields = z.infer<typeof AccountFields>;

export const AccountCreateInput = AccountFields.partial().required({ displayName: true, assetClass: true });
export const AccountPatch = AccountFields.partial();

const ValuationInput = z.object({
  amountMinor: minor,
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  valuationDate: isoDate,
  source: ValuationSource,
  sourceNote: optText(300),
  confidence: ValuationConfidence,
});

const NoteFields = z.object({
  kind: z.enum(["note", "question"]),
  title: optText(140),
  body: text(5000).min(1, "Please write something first"),
  pinned: z.boolean(),
  accountId: id.optional(),
  planId: id.optional(),
});

const PlanFields = z.object({
  title: text(140).min(1, "Please give the plan a title"),
  category: optText(60),
  description: optText(5000),
  status: PlanStatus,
  targetDate: isoDate.optional(),
  budgetMinor: minor.optional(),
  relatedAccountIds: z.array(id).max(50),
});

const DocumentFields = z.object({
  title: text(140).min(1),
  kind: DocumentRef.shape.kind,
  whereKept: optText(300),
  documentDate: isoDate.optional(),
  accountIds: z.array(id).max(20),
  note: optText(1000),
});

const PersonFields = z.object({
  name: text(80).min(1),
  relation: optText(80),
  phone: optText(40),
  email: optText(200),
  note: optText(500),
});

const reason = optText(500);
const version = z.number().int().nonnegative();

export const Command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("account.create"), data: AccountCreateInput }),
  z.object({ type: z.literal("account.update"), id, expectedVersion: version, patch: AccountPatch, reason }),
  z.object({ type: z.literal("account.archive"), id, expectedVersion: version, reason }),
  z.object({ type: z.literal("account.restore"), id, reason }),
  z.object({ type: z.literal("account.setAwaitingStatement"), id, value: z.boolean() }),

  z.object({ type: z.literal("valuation.add"), accountId: id, valuation: ValuationInput, reason }),
  z.object({ type: z.literal("valuation.verify"), accountId: id, valuationId: id, sourceNote: optText(300) }),
  z.object({ type: z.literal("valuation.setAside"), accountId: id, valuationId: id, note: optText(300) }),
  z.object({
    type: z.literal("valuation.flagConflict"),
    accountId: id,
    valuationIds: z.array(id).min(2).max(10),
    note: optText(500),
  }),
  z.object({ type: z.literal("valuation.resolveConflict"), accountId: id, keepValuationId: id, note: optText(500) }),

  z.object({ type: z.literal("note.create"), data: NoteFields.partial().required({ body: true, kind: true }) }),
  z.object({ type: z.literal("note.update"), id, expectedVersion: version, patch: NoteFields.partial() }),
  z.object({ type: z.literal("note.resolve"), id, resolved: z.boolean() }),
  z.object({ type: z.literal("note.archive"), id, reason }),
  z.object({ type: z.literal("note.restore"), id }),
  z.object({ type: z.literal("note.comment"), noteId: id, body: text(5000).min(1) }),
  z.object({ type: z.literal("note.editComment"), noteId: id, commentId: id, body: text(5000).min(1) }),

  z.object({ type: z.literal("plan.create"), data: PlanFields.partial().required({ title: true }) }),
  z.object({ type: z.literal("plan.update"), id, expectedVersion: version, patch: PlanFields.partial() }),
  z.object({ type: z.literal("plan.archive"), id, reason }),
  z.object({ type: z.literal("plan.restore"), id }),
  z.object({
    type: z.literal("plan.addEntry"),
    planId: id,
    entryType: z.enum(["proposal", "discussion", "action_item"]),
    body: text(5000).min(1),
  }),
  z.object({ type: z.literal("plan.recordDecision"), planId: id, body: text(5000).min(1) }),
  z.object({ type: z.literal("plan.agree"), planId: id, entryId: id, agree: z.boolean() }),
  z.object({ type: z.literal("plan.editEntry"), planId: id, entryId: id, body: text(5000).min(1) }),
  z.object({
    type: z.literal("plan.addTask"),
    planId: id,
    title: text(200).min(1),
    assigneePersonId: id.optional(),
    dueDate: isoDate.optional(),
  }),
  z.object({ type: z.literal("plan.setTaskDone"), planId: id, taskId: id, done: z.boolean() }),

  z.object({
    type: z.literal("check.create"),
    title: text(200).min(1),
    detail: optText(1000),
    accountId: id.optional(),
  }),
  z.object({ type: z.literal("check.setDone"), id, done: z.boolean(), note: optText(500) }),
  z.object({ type: z.literal("check.archive"), id }),

  z.object({
    type: z.literal("document.create"),
    data: DocumentFields.partial().required({ title: true, kind: true }),
  }),
  z.object({ type: z.literal("document.update"), id, expectedVersion: version, patch: DocumentFields.partial() }),
  z.object({ type: z.literal("document.archive"), id }),

  z.object({ type: z.literal("person.create"), data: PersonFields }),
  z.object({ type: z.literal("person.update"), id, patch: PersonFields.partial() }),
]);
export type Command = z.infer<typeof Command>;

/* ------------------------------------------------------------------ */
/* Errors and context                                                  */
/* ------------------------------------------------------------------ */

export type DomainErrorCode = "not_found" | "version_conflict" | "invalid" | "not_allowed";

export class DomainError extends Error {
  constructor(
    public code: DomainErrorCode,
    /** Friendly, non-technical message safe to show to the family. */
    public friendly: string,
    public current?: unknown,
  ) {
    super(friendly);
    this.name = "DomainError";
  }
}

export interface CommandContext {
  actorId: string; // member id
  now: string; // ISO timestamp
  newId: () => string;
}

export interface AuditDraft {
  action: Command["type"];
  entityType: "account" | "note" | "plan" | "check" | "document" | "person";
  entityId: string;
  entityLabel?: string;
  summary: string;
  changes: FieldChange[];
  reason?: string;
}

export interface CommandResult {
  state: LedgerState;
  audit: AuditDraft[];
  entityId: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const MASK_CHAR = "•";

function diff(before: Record<string, unknown>, patch: Record<string, unknown>): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const [field, after] of Object.entries(patch)) {
    if (after === undefined && !(field in before)) continue;
    const prev = before[field];
    if (JSON.stringify(prev) !== JSON.stringify(after)) changes.push({ field, before: prev, after });
  }
  return changes;
}

function find<T extends { id: string }>(list: T[], entityId: string, what: string): T {
  const found = list.find((x) => x.id === entityId);
  if (!found) throw new DomainError("not_found", `We couldn't find that ${what}. It may have been removed.`);
  return found;
}

function checkVersion(entity: { version: number }, expected: number, what: string) {
  if (entity.version !== expected) {
    throw new DomainError(
      "version_conflict",
      `Someone else changed this ${what} while you were editing. Please review their change before saving again.`,
      structuredClone(entity),
    );
  }
}

function assertPeople(state: LedgerState, ids: (string | undefined)[]) {
  for (const pid of ids) {
    if (pid && !state.people.some((p) => p.id === pid)) {
      throw new DomainError("invalid", "One of the people chosen isn't in the family list.");
    }
  }
}

function assertAccounts(state: LedgerState, ids: (string | undefined)[]) {
  for (const aid of ids) {
    if (aid && !state.accounts.some((a) => a.id === aid)) {
      throw new DomainError("invalid", "One of the linked accounts couldn't be found.");
    }
  }
}

function assertNoMaskedValues(access: z.infer<typeof AccessDetails> | undefined) {
  if (!access) return;
  const fields = [access.usernameHint, access.registeredEmail, access.registeredPhone, access.otpDestination];
  if (fields.some((f) => f?.includes(MASK_CHAR))) {
    throw new DomainError("invalid", "Please tap “Show details” before editing sign-in details.");
  }
}

function assertParent(state: LedgerState, accountId: string | undefined, parentId: string | undefined) {
  if (!parentId) return;
  if (parentId === accountId) throw new DomainError("invalid", "An account can't be inside itself.");
  let cursor: string | undefined = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === accountId || seen.has(cursor)) {
      throw new DomainError("invalid", "That would put an account inside one of its own holdings.");
    }
    seen.add(cursor);
    cursor = find(state.accounts, cursor, "parent account").parentId;
  }
}

function validateAccountRefs(state: LedgerState, accountId: string | undefined, f: Partial<AccountFields>) {
  assertParent(state, accountId, f.parentId);
  assertAccounts(state, f.linkedAccountIds ?? []);
  assertPeople(state, [
    f.managedByPersonId,
    ...(f.ownership?.owners.map((o) => o.personId) ?? []),
    ...(f.ownership?.associatedPersonIds ?? []),
  ]);
  assertNoMaskedValues(f.access);
  if (f.ownership?.owners.some((o) => o.sharePercent)) {
    const total = f.ownership.owners.reduce((sum, o) => sum + Math.round(Number(o.sharePercent ?? 0) * 100), 0);
    if (total > 10_000) throw new DomainError("invalid", "Ownership shares add up to more than 100%.");
  }
}

function touch<T extends { version: number; updatedAt?: string; updatedBy?: string }>(entity: T, ctx: CommandContext) {
  entity.version += 1;
  if ("updatedAt" in entity) entity.updatedAt = ctx.now;
  if ("updatedBy" in entity) entity.updatedBy = ctx.actorId;
}

function requireAuthor(authorId: string, ctx: CommandContext) {
  if (authorId !== ctx.actorId) {
    throw new DomainError(
      "not_allowed",
      "Only the person who wrote this can change their words. You can add your own reply instead.",
    );
  }
}

/* ------------------------------------------------------------------ */
/* Apply                                                               */
/* ------------------------------------------------------------------ */

/**
 * Pure function: validates and applies one command to a copy of the state.
 * Used identically by the demo adapter (in the browser, fictional data only)
 * and by the server.
 */
export function applyCommand(input: LedgerState, rawCommand: unknown, ctx: CommandContext): CommandResult {
  const parsed = Command.safeParse(rawCommand);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new DomainError(
      "invalid",
      first?.message && first.message.length < 120 ? first.message : "Some details need another look.",
    );
  }
  const cmd = parsed.data;
  const state = structuredClone(input);
  if (!state.members.some((m) => m.id === ctx.actorId && m.status === "active")) {
    throw new DomainError("not_allowed", "Your account isn't active.");
  }
  const audit: AuditDraft[] = [];
  let entityId = "";

  switch (cmd.type) {
    /* ---------- Accounts ---------- */
    case "account.create": {
      validateAccountRefs(state, undefined, cmd.data);
      const account = Account.parse({
        ...cmd.data,
        id: ctx.newId(),
        version: 0,
        ownership: cmd.data.ownership ?? { status: "unknown", owners: [], associatedPersonIds: [] },
        valuations: [],
        createdBy: ctx.actorId,
        createdAt: ctx.now,
        updatedBy: ctx.actorId,
        updatedAt: ctx.now,
      });
      state.accounts.push(account);
      entityId = account.id;
      audit.push({
        action: cmd.type,
        entityType: "account",
        entityId,
        entityLabel: account.displayName,
        summary: `Added the account “${account.displayName}”`,
        changes: [],
      });
      break;
    }
    case "account.update": {
      const account = find(state.accounts, cmd.id, "account");
      checkVersion(account, cmd.expectedVersion, "account");
      validateAccountRefs(state, account.id, cmd.patch);
      const changes = diff(account as unknown as Record<string, unknown>, cmd.patch);
      if (changes.length === 0) {
        entityId = account.id;
        break;
      }
      const next = Account.parse({ ...account, ...cmd.patch });
      Object.assign(account, next);
      touch(account, ctx);
      entityId = account.id;
      const ownershipChanged = changes.some((c) => c.field === "ownership");
      audit.push({
        action: cmd.type,
        entityType: "account",
        entityId,
        entityLabel: account.displayName,
        summary: ownershipChanged
          ? `Changed ownership details for “${account.displayName}”`
          : `Edited “${account.displayName}” (${changes.map((c) => c.field).join(", ")})`,
        changes,
        reason: cmd.reason,
      });
      break;
    }
    case "account.archive": {
      const account = find(state.accounts, cmd.id, "account");
      checkVersion(account, cmd.expectedVersion, "account");
      if (account.archivedAt) break;
      account.archivedAt = ctx.now;
      account.archivedBy = ctx.actorId;
      touch(account, ctx);
      entityId = account.id;
      audit.push({
        action: cmd.type,
        entityType: "account",
        entityId,
        entityLabel: account.displayName,
        summary: `Archived “${account.displayName}” (it can be restored)`,
        changes: [{ field: "archivedAt", before: undefined, after: ctx.now }],
        reason: cmd.reason,
      });
      break;
    }
    case "account.restore": {
      const account = find(state.accounts, cmd.id, "account");
      if (!account.archivedAt) {
        entityId = account.id;
        break;
      }
      const was = account.archivedAt;
      delete account.archivedAt;
      delete account.archivedBy;
      touch(account, ctx);
      entityId = account.id;
      audit.push({
        action: cmd.type,
        entityType: "account",
        entityId,
        entityLabel: account.displayName,
        summary: `Restored “${account.displayName}”`,
        changes: [{ field: "archivedAt", before: was, after: undefined }],
        reason: cmd.reason,
      });
      break;
    }
    case "account.setAwaitingStatement": {
      const account = find(state.accounts, cmd.id, "account");
      if (account.awaitingStatement === cmd.value) {
        entityId = account.id;
        break;
      }
      account.awaitingStatement = cmd.value;
      touch(account, ctx);
      entityId = account.id;
      audit.push({
        action: cmd.type,
        entityType: "account",
        entityId,
        entityLabel: account.displayName,
        summary: cmd.value
          ? `Marked “${account.displayName}” as waiting for a statement`
          : `“${account.displayName}” is no longer waiting for a statement`,
        changes: [{ field: "awaitingStatement", before: !cmd.value, after: cmd.value }],
      });
      break;
    }

    /* ---------- Valuations ---------- */
    case "valuation.add": {
      const account = find(state.accounts, cmd.accountId, "account");
      const v = cmd.valuation;
      const valuation = {
        id: ctx.newId(),
        amountMinor: v.amountMinor,
        currency: v.currency ?? account.currency,
        valuationDate: v.valuationDate,
        source: v.source,
        sourceNote: v.sourceNote,
        confidence: v.confidence,
        enteredBy: ctx.actorId,
        enteredAt: ctx.now,
      };
      // Two verified values for the same date that disagree: keep both, flag it.
      const clash = account.valuations.find(
        (old) =>
          !old.setAside &&
          old.confidence === "verified" &&
          v.confidence === "verified" &&
          old.valuationDate === v.valuationDate &&
          old.amountMinor !== v.amountMinor,
      );
      account.valuations.push(valuation);
      if (clash && !account.conflict) {
        account.conflict = {
          valuationIds: [clash.id, valuation.id],
          note: "Two verified amounts were entered for the same date.",
          raisedBy: ctx.actorId,
          raisedAt: ctx.now,
        };
      }
      if (v.confidence === "verified" && account.awaitingStatement && v.source === "statement") {
        account.awaitingStatement = false;
      }
      touch(account, ctx);
      entityId = account.id;
      const label = v.confidence === "verified" ? "verified" : "estimated";
      audit.push({
        action: cmd.type,
        entityType: "account",
        entityId,
        entityLabel: account.displayName,
        summary: `Added an ${label} amount of ${formatINRShort(v.amountMinor)} for “${account.displayName}” (as of ${v.valuationDate})${clash ? " — this differs from an earlier verified amount, so both are kept" : ""}`,
        changes: [{ field: "valuation", before: undefined, after: valuation }],
        reason: cmd.reason,
      });
      break;
    }
    case "valuation.verify": {
      const account = find(state.accounts, cmd.accountId, "account");
      const valuation = find(account.valuations, cmd.valuationId, "amount");
      if (valuation.confidence === "verified") {
        entityId = account.id;
        break;
      }
      valuation.confidence = "verified";
      if (cmd.sourceNote) valuation.sourceNote = cmd.sourceNote;
      touch(account, ctx);
      entityId = account.id;
      audit.push({
        action: cmd.type,
        entityType: "account",
        entityId,
        entityLabel: account.displayName,
        summary: `Marked ${formatINRShort(valuation.amountMinor)} for “${account.displayName}” as verified`,
        changes: [{ field: "confidence", before: "estimated", after: "verified" }],
      });
      break;
    }
    case "valuation.setAside": {
      const account = find(state.accounts, cmd.accountId, "account");
      const valuation = find(account.valuations, cmd.valuationId, "amount");
      if (valuation.setAside) {
        entityId = account.id;
        break;
      }
      valuation.setAside = { by: ctx.actorId, at: ctx.now, note: cmd.note };
      touch(account, ctx);
      entityId = account.id;
      audit.push({
        action: cmd.type,
        entityType: "account",
        entityId,
        entityLabel: account.displayName,
        summary: `Set aside the amount ${formatINRShort(valuation.amountMinor)} for “${account.displayName}” (kept in history)`,
        changes: [{ field: "setAside", before: undefined, after: valuation.setAside }],
        reason: cmd.note,
      });
      break;
    }
    case "valuation.flagConflict": {
      const account = find(state.accounts, cmd.accountId, "account");
      cmd.valuationIds.forEach((vid) => find(account.valuations, vid, "amount"));
      account.conflict = { valuationIds: cmd.valuationIds, note: cmd.note, raisedBy: ctx.actorId, raisedAt: ctx.now };
      touch(account, ctx);
      entityId = account.id;
      audit.push({
        action: cmd.type,
        entityType: "account",
        entityId,
        entityLabel: account.displayName,
        summary: `Noted that amounts for “${account.displayName}” don't agree`,
        changes: [{ field: "conflict", before: undefined, after: account.conflict }],
        reason: cmd.note,
      });
      break;
    }
    case "valuation.resolveConflict": {
      const account = find(state.accounts, cmd.accountId, "account");
      if (!account.conflict) throw new DomainError("invalid", "These amounts are no longer marked as disagreeing.");
      if (!account.conflict.valuationIds.includes(cmd.keepValuationId)) {
        throw new DomainError("invalid", "Please choose one of the amounts that disagreed.");
      }
      const before = account.conflict;
      for (const vid of before.valuationIds) {
        const v = find(account.valuations, vid, "amount");
        if (vid === cmd.keepValuationId) {
          v.confidence = "verified";
          delete v.setAside;
        } else if (!v.setAside) {
          v.setAside = { by: ctx.actorId, at: ctx.now, note: cmd.note ?? "Resolved in favour of another amount" };
        }
      }
      delete account.conflict;
      touch(account, ctx);
      entityId = account.id;
      const kept = find(account.valuations, cmd.keepValuationId, "amount");
      audit.push({
        action: cmd.type,
        entityType: "account",
        entityId,
        entityLabel: account.displayName,
        summary: `Settled the disagreement for “${account.displayName}”: ${formatINRShort(kept.amountMinor)} is the agreed amount (others kept in history)`,
        changes: [{ field: "conflict", before, after: undefined }],
        reason: cmd.note,
      });
      break;
    }

    /* ---------- Notes ---------- */
    case "note.create": {
      if (cmd.data.accountId) find(state.accounts, cmd.data.accountId, "account");
      if (cmd.data.planId) find(state.plans, cmd.data.planId, "plan");
      const note = Note.parse({
        ...cmd.data,
        id: ctx.newId(),
        version: 0,
        authorId: ctx.actorId,
        createdAt: ctx.now,
        updatedBy: ctx.actorId,
        updatedAt: ctx.now,
      });
      state.notes.push(note);
      entityId = note.id;
      audit.push({
        action: cmd.type,
        entityType: "note",
        entityId,
        entityLabel: note.title ?? note.body.slice(0, 60),
        summary: note.kind === "question" ? "Asked a question" : "Added a note",
        changes: [{ field: "body", before: undefined, after: note.body }],
      });
      break;
    }
    case "note.update": {
      const note = find(state.notes, cmd.id, "note");
      checkVersion(note, cmd.expectedVersion, "note");
      if (cmd.patch.accountId) find(state.accounts, cmd.patch.accountId, "account");
      if (cmd.patch.planId) find(state.plans, cmd.patch.planId, "plan");
      const changes = diff(note as unknown as Record<string, unknown>, cmd.patch);
      if (changes.length === 0) {
        entityId = note.id;
        break;
      }
      if (cmd.patch.body !== undefined && cmd.patch.body !== note.body) {
        note.history.push({ body: note.body, editedBy: note.updatedBy, editedAt: note.updatedAt });
      }
      Object.assign(note, Note.parse({ ...note, ...cmd.patch }));
      touch(note, ctx);
      entityId = note.id;
      audit.push({
        action: cmd.type,
        entityType: "note",
        entityId,
        entityLabel: note.title ?? note.body.slice(0, 60),
        summary:
          changes.length === 1 && changes[0]!.field === "pinned"
            ? note.pinned
              ? "Pinned a note"
              : "Unpinned a note"
            : "Edited a note (earlier wording is kept)",
        changes,
      });
      break;
    }
    case "note.resolve": {
      const note = find(state.notes, cmd.id, "note");
      const isResolved = Boolean(note.resolvedAt);
      if (isResolved === cmd.resolved) {
        entityId = note.id;
        break;
      }
      if (cmd.resolved) {
        note.resolvedAt = ctx.now;
        note.resolvedBy = ctx.actorId;
      } else {
        delete note.resolvedAt;
        delete note.resolvedBy;
      }
      touch(note, ctx);
      entityId = note.id;
      audit.push({
        action: cmd.type,
        entityType: "note",
        entityId,
        entityLabel: note.title ?? note.body.slice(0, 60),
        summary: cmd.resolved ? "Marked a question as answered" : "Reopened a question",
        changes: [{ field: "resolved", before: isResolved, after: cmd.resolved }],
      });
      break;
    }
    case "note.archive":
    case "note.restore": {
      const note = find(state.notes, cmd.id, "note");
      const archiving = cmd.type === "note.archive";
      entityId = note.id;
      if (Boolean(note.archivedAt) === archiving) break;
      if (archiving) {
        note.archivedAt = ctx.now;
        note.archivedBy = ctx.actorId;
      } else {
        delete note.archivedAt;
        delete note.archivedBy;
      }
      touch(note, ctx);
      audit.push({
        action: cmd.type,
        entityType: "note",
        entityId,
        entityLabel: note.title ?? note.body.slice(0, 60),
        summary: archiving ? "Archived a note (it can be restored)" : "Restored a note",
        changes: [{ field: "archived", before: !archiving, after: archiving }],
        reason: cmd.type === "note.archive" ? cmd.reason : undefined,
      });
      break;
    }
    case "note.comment": {
      const note = find(state.notes, cmd.noteId, "note");
      const comment = { id: ctx.newId(), authorId: ctx.actorId, body: cmd.body, createdAt: ctx.now, history: [] };
      note.comments.push(comment);
      touch(note, ctx);
      entityId = note.id;
      audit.push({
        action: cmd.type,
        entityType: "note",
        entityId,
        entityLabel: note.title ?? note.body.slice(0, 60),
        summary: "Replied to a note",
        changes: [{ field: "comment", before: undefined, after: cmd.body }],
      });
      break;
    }
    case "note.editComment": {
      const note = find(state.notes, cmd.noteId, "note");
      const comment = find(note.comments, cmd.commentId, "reply");
      requireAuthor(comment.authorId, ctx);
      if (comment.body === cmd.body) {
        entityId = note.id;
        break;
      }
      comment.history.push({
        body: comment.body,
        editedBy: ctx.actorId,
        editedAt: comment.editedAt ?? comment.createdAt,
      });
      const before = comment.body;
      comment.body = cmd.body;
      comment.editedAt = ctx.now;
      touch(note, ctx);
      entityId = note.id;
      audit.push({
        action: cmd.type,
        entityType: "note",
        entityId,
        entityLabel: note.title ?? note.body.slice(0, 60),
        summary: "Edited their reply (earlier wording is kept)",
        changes: [{ field: "comment", before, after: cmd.body }],
      });
      break;
    }

    /* ---------- Plans ---------- */
    case "plan.create": {
      assertAccounts(state, cmd.data.relatedAccountIds ?? []);
      const plan = Plan.parse({
        status: "idea",
        ...cmd.data,
        id: ctx.newId(),
        version: 0,
        proposedBy: ctx.actorId,
        createdAt: ctx.now,
        updatedBy: ctx.actorId,
        updatedAt: ctx.now,
      });
      state.plans.push(plan);
      entityId = plan.id;
      audit.push({
        action: cmd.type,
        entityType: "plan",
        entityId,
        entityLabel: plan.title,
        summary: `Proposed a plan: “${plan.title}”`,
        changes: [],
      });
      break;
    }
    case "plan.update": {
      const plan = find(state.plans, cmd.id, "plan");
      checkVersion(plan, cmd.expectedVersion, "plan");
      assertAccounts(state, cmd.patch.relatedAccountIds ?? []);
      const changes = diff(plan as unknown as Record<string, unknown>, cmd.patch);
      entityId = plan.id;
      if (changes.length === 0) break;
      Object.assign(plan, Plan.parse({ ...plan, ...cmd.patch }));
      touch(plan, ctx);
      audit.push({
        action: cmd.type,
        entityType: "plan",
        entityId,
        entityLabel: plan.title,
        summary: changes.some((c) => c.field === "status")
          ? `Moved “${plan.title}” to ${String(cmd.patch.status).replace("_", " ")}`
          : `Edited the plan “${plan.title}”`,
        changes,
      });
      break;
    }
    case "plan.archive":
    case "plan.restore": {
      const plan = find(state.plans, cmd.id, "plan");
      const archiving = cmd.type === "plan.archive";
      entityId = plan.id;
      if (Boolean(plan.archivedAt) === archiving) break;
      if (archiving) {
        plan.archivedAt = ctx.now;
        plan.archivedBy = ctx.actorId;
      } else {
        delete plan.archivedAt;
        delete plan.archivedBy;
      }
      touch(plan, ctx);
      audit.push({
        action: cmd.type,
        entityType: "plan",
        entityId,
        entityLabel: plan.title,
        summary: archiving ? `Archived the plan “${plan.title}”` : `Restored the plan “${plan.title}”`,
        changes: [{ field: "archived", before: !archiving, after: archiving }],
        reason: cmd.type === "plan.archive" ? cmd.reason : undefined,
      });
      break;
    }
    case "plan.addEntry":
    case "plan.recordDecision": {
      const plan = find(state.plans, cmd.planId, "plan");
      const isDecision = cmd.type === "plan.recordDecision";
      const entry = {
        id: ctx.newId(),
        type: isDecision ? ("decision" as const) : cmd.entryType,
        authorId: ctx.actorId,
        body: cmd.body,
        createdAt: ctx.now,
        history: [],
        // The person recording a decision agrees with it; others must say so themselves.
        agreedBy: isDecision ? [ctx.actorId] : [],
      };
      plan.entries.push(entry);
      touch(plan, ctx);
      entityId = plan.id;
      const verb = {
        proposal: "Made a proposal",
        discussion: "Added a thought",
        action_item: "Added an action",
        decision: "Recorded a decision",
      }[entry.type];
      audit.push({
        action: cmd.type,
        entityType: "plan",
        entityId,
        entityLabel: plan.title,
        summary: `${verb} on “${plan.title}”`,
        changes: [{ field: entry.type, before: undefined, after: cmd.body }],
      });
      break;
    }
    case "plan.agree": {
      const plan = find(state.plans, cmd.planId, "plan");
      const entry = find(plan.entries, cmd.entryId, "decision");
      if (entry.type !== "decision") throw new DomainError("invalid", "Only decisions can be agreed to.");
      const has = entry.agreedBy.includes(ctx.actorId);
      entityId = plan.id;
      if (has === cmd.agree) break;
      entry.agreedBy = cmd.agree ? [...entry.agreedBy, ctx.actorId] : entry.agreedBy.filter((m) => m !== ctx.actorId);
      touch(plan, ctx);
      audit.push({
        action: cmd.type,
        entityType: "plan",
        entityId,
        entityLabel: plan.title,
        summary: cmd.agree ? `Agreed with a decision on “${plan.title}”` : `Withdrew agreement on “${plan.title}”`,
        changes: [{ field: "agreedBy", before: has, after: cmd.agree }],
      });
      break;
    }
    case "plan.editEntry": {
      const plan = find(state.plans, cmd.planId, "plan");
      const entry = find(plan.entries, cmd.entryId, "message");
      requireAuthor(entry.authorId, ctx);
      entityId = plan.id;
      if (entry.body === cmd.body) break;
      entry.history.push({ body: entry.body, editedBy: ctx.actorId, editedAt: entry.editedAt ?? entry.createdAt });
      const before = entry.body;
      entry.body = cmd.body;
      entry.editedAt = ctx.now;
      if (entry.type === "decision") entry.agreedBy = [ctx.actorId]; // wording changed: others re-confirm
      touch(plan, ctx);
      audit.push({
        action: cmd.type,
        entityType: "plan",
        entityId,
        entityLabel: plan.title,
        summary: `Edited their ${entry.type.replace("_", " ")} on “${plan.title}” (earlier wording is kept)`,
        changes: [{ field: entry.type, before, after: cmd.body }],
      });
      break;
    }
    case "plan.addTask": {
      const plan = find(state.plans, cmd.planId, "plan");
      assertPeople(state, [cmd.assigneePersonId]);
      const task = {
        id: ctx.newId(),
        title: cmd.title,
        assigneePersonId: cmd.assigneePersonId,
        dueDate: cmd.dueDate,
        done: false,
        createdBy: ctx.actorId,
        createdAt: ctx.now,
      };
      plan.tasks.push(task);
      touch(plan, ctx);
      entityId = plan.id;
      audit.push({
        action: cmd.type,
        entityType: "plan",
        entityId,
        entityLabel: plan.title,
        summary: `Added the step “${cmd.title}” to “${plan.title}”`,
        changes: [],
      });
      break;
    }
    case "plan.setTaskDone": {
      const plan = find(state.plans, cmd.planId, "plan");
      const task = find(plan.tasks, cmd.taskId, "step");
      entityId = plan.id;
      if (task.done === cmd.done) break;
      task.done = cmd.done;
      if (cmd.done) {
        task.doneBy = ctx.actorId;
        task.doneAt = ctx.now;
      } else {
        delete task.doneBy;
        delete task.doneAt;
      }
      touch(plan, ctx);
      audit.push({
        action: cmd.type,
        entityType: "plan",
        entityId,
        entityLabel: plan.title,
        summary: `${cmd.done ? "Completed" : "Reopened"} the step “${task.title}”`,
        changes: [{ field: "done", before: !cmd.done, after: cmd.done }],
      });
      break;
    }

    /* ---------- Things to check ---------- */
    case "check.create": {
      if (cmd.accountId) find(state.accounts, cmd.accountId, "account");
      const check = CheckItem.parse({
        id: ctx.newId(),
        version: 0,
        title: cmd.title,
        detail: cmd.detail,
        accountId: cmd.accountId,
        createdBy: ctx.actorId,
        createdAt: ctx.now,
      });
      state.checks.push(check);
      entityId = check.id;
      audit.push({
        action: cmd.type,
        entityType: "check",
        entityId,
        entityLabel: check.title,
        summary: `Added “${check.title}” to things to check`,
        changes: [],
      });
      break;
    }
    case "check.setDone": {
      const check = find(state.checks, cmd.id, "item");
      entityId = check.id;
      if (Boolean(check.doneAt) === cmd.done) break;
      if (cmd.done) {
        check.doneAt = ctx.now;
        check.doneBy = ctx.actorId;
        check.doneNote = cmd.note;
      } else {
        delete check.doneAt;
        delete check.doneBy;
        delete check.doneNote;
      }
      check.version += 1;
      audit.push({
        action: cmd.type,
        entityType: "check",
        entityId,
        entityLabel: check.title,
        summary: cmd.done ? `Checked off “${check.title}”` : `Reopened “${check.title}”`,
        changes: [{ field: "done", before: !cmd.done, after: cmd.done }],
        reason: cmd.note,
      });
      break;
    }
    case "check.archive": {
      const check = find(state.checks, cmd.id, "item");
      entityId = check.id;
      if (check.archivedAt) break;
      check.archivedAt = ctx.now;
      check.version += 1;
      audit.push({
        action: cmd.type,
        entityType: "check",
        entityId,
        entityLabel: check.title,
        summary: `Removed “${check.title}” from things to check`,
        changes: [],
      });
      break;
    }

    /* ---------- Documents (index only) ---------- */
    case "document.create": {
      assertAccounts(state, cmd.data.accountIds ?? []);
      const doc = DocumentRef.parse({
        ...cmd.data,
        id: ctx.newId(),
        version: 0,
        addedBy: ctx.actorId,
        addedAt: ctx.now,
      });
      state.documents.push(doc);
      entityId = doc.id;
      audit.push({
        action: cmd.type,
        entityType: "document",
        entityId,
        entityLabel: doc.title,
        summary: `Listed the document “${doc.title}”`,
        changes: [],
      });
      break;
    }
    case "document.update": {
      const doc = find(state.documents, cmd.id, "document");
      checkVersion(doc, cmd.expectedVersion, "document");
      assertAccounts(state, cmd.patch.accountIds ?? []);
      const changes = diff(doc as unknown as Record<string, unknown>, cmd.patch);
      entityId = doc.id;
      if (changes.length === 0) break;
      Object.assign(doc, DocumentRef.parse({ ...doc, ...cmd.patch }));
      doc.version += 1;
      audit.push({
        action: cmd.type,
        entityType: "document",
        entityId,
        entityLabel: doc.title,
        summary: `Edited the document entry “${doc.title}”`,
        changes,
      });
      break;
    }
    case "document.archive": {
      const doc = find(state.documents, cmd.id, "document");
      entityId = doc.id;
      if (doc.archivedAt) break;
      doc.archivedAt = ctx.now;
      doc.version += 1;
      audit.push({
        action: cmd.type,
        entityType: "document",
        entityId,
        entityLabel: doc.title,
        summary: `Archived the document entry “${doc.title}”`,
        changes: [],
      });
      break;
    }

    /* ---------- People ---------- */
    case "person.create": {
      const person = Person.parse({ ...cmd.data, id: ctx.newId() });
      state.people.push(person);
      entityId = person.id;
      audit.push({
        action: cmd.type,
        entityType: "person",
        entityId,
        entityLabel: person.name,
        summary: `Added ${person.name} to the people list`,
        changes: [],
      });
      break;
    }
    case "person.update": {
      const person = find(state.people, cmd.id, "person");
      const changes = diff(person as unknown as Record<string, unknown>, cmd.patch);
      entityId = person.id;
      if (changes.length === 0) break;
      Object.assign(person, Person.parse({ ...person, ...cmd.patch }));
      audit.push({
        action: cmd.type,
        entityType: "person",
        entityId,
        entityLabel: person.name,
        summary: `Updated details for ${person.name}`,
        changes,
      });
      break;
    }
  }

  if (audit.length > 0) {
    state.revision += 1;
    state.updatedAt = ctx.now;
  }
  return { state, audit, entityId };
}
