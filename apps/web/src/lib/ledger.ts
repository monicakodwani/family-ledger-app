import {
  ATTENTION_LABELS,
  activeAccounts,
  attentionItems,
  deriveValue,
  isCountedElsewhere,
  isLiability,
  type Account,
  type AttentionItem,
  type AuditEntry,
  type CheckItem,
  type LedgerState,
} from "@family-ledger/shared";
import { formatDate, personName } from "./format";

export function findAccount(ledger: LedgerState, id: string | undefined): Account | undefined {
  return ledger.accounts.find((a) => a.id === id);
}

/** People linked to an account: confirmed owners first, then associated people. */
export function ownerNames(ledger: LedgerState, account: Account): string[] {
  const ids = account.ownership.owners.length
    ? account.ownership.owners.map((o) => o.personId)
    : account.ownership.associatedPersonIds;
  return ids.map((id) => personName(ledger, id));
}

/** "Groww · Rohit manages it" style subtitle. */
export function whereLine(ledger: LedgerState, account: Account): string {
  const parts: string[] = [];
  if (account.institution) parts.push(account.institution);
  if (account.managedByPersonId) parts.push(`${personName(ledger, account.managedByPersonId)} manages it`);
  if (parts.length === 0) {
    const names = ownerNames(ledger, account);
    if (names.length) parts.push(names.join(" & "));
  }
  return parts.join(" · ");
}

export interface CheckPreview {
  key: string;
  title: string;
  accountId?: string;
  href: string;
  kind: "explicit" | "derived";
  item?: CheckItem;
  attention?: AttentionItem;
}

/** Explicit check items plus things derived from the records, without duplicates. */
export function thingsToCheck(ledger: LedgerState, today: string): CheckPreview[] {
  const explicit: CheckPreview[] = ledger.checks
    .filter((c) => !c.archivedAt && !c.doneAt)
    .map((c) => ({ key: c.id, title: c.title, accountId: c.accountId, href: "/checks", kind: "explicit", item: c }));
  const derived: CheckPreview[] = attentionItems(ledger, today).map((a) => {
    const account = findAccount(ledger, a.accountId);
    return {
      key: `${a.accountId}:${a.reason}`,
      title: `${account?.displayName ?? "An account"}: ${ATTENTION_LABELS[a.reason].toLowerCase()}`,
      accountId: a.accountId,
      href: `/accounts/${a.accountId}`,
      kind: "derived",
      attention: a,
    };
  });
  return [...explicit, ...derived];
}

/** Accounts that matter for the family totals (active, not closed, not double counted). */
export function relevantAccounts(ledger: LedgerState): Account[] {
  return activeAccounts(ledger).filter((a) => a.lifecycle !== "closed" && !isCountedElsewhere(a, ledger));
}

export function amountCounts(ledger: LedgerState, today: string): { withAmount: number; total: number } {
  const accounts = relevantAccounts(ledger);
  const withAmount = accounts.filter((a) => deriveValue(a, today).current).length;
  return { withAmount, total: accounts.length };
}

export function liabilities(ledger: LedgerState): Account[] {
  return activeAccounts(ledger).filter(isLiability);
}

/** Make audit summaries friendlier: ISO dates become "12 Oct 2026". */
export function prettySummary(summary: string): string {
  return summary.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (d) => formatDate(d));
}

export function auditHref(entry: AuditEntry): string | undefined {
  if (!entry.entityId) return undefined;
  switch (entry.entityType) {
    case "account":
      return `/accounts/${entry.entityId}`;
    case "plan":
      return `/plans/${entry.entityId}`;
    case "note":
      return `/notes/${entry.entityId}`;
    case "check":
      return "/checks";
    case "document":
      return "/documents";
    default:
      return undefined;
  }
}
