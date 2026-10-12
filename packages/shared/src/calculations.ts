import type { Account, AssetClass, LedgerState, Liquidity, Valuation, VerificationStatus } from "./schema";
import { type MinorUnits, toBig, fromBig } from "./money";

export const DEFAULT_STALE_DAYS = 180;

export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const [fy, fm, fd] = fromIsoDate.slice(0, 10).split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = toIsoDate.slice(0, 10).split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

function byNewest(a: Valuation, b: Valuation): number {
  if (a.valuationDate !== b.valuationDate) return a.valuationDate < b.valuationDate ? 1 : -1;
  return a.enteredAt < b.enteredAt ? 1 : a.enteredAt > b.enteredAt ? -1 : 0;
}

export interface ValueView {
  status: VerificationStatus;
  /** The amount we show as "the" value. Undefined when not entered or conflicting. */
  current?: Valuation;
  latestVerified?: Valuation;
  /** A newer estimate that did NOT replace a verified value. */
  newerEstimate?: Valuation;
  conflicting: Valuation[];
}

/**
 * Decide what value to show for an account and how sure we are.
 * Rule: a newer unverified estimate never silently replaces a verified value.
 */
export function deriveValue(account: Account, today: string, staleDays = DEFAULT_STALE_DAYS): ValueView {
  const vals = account.valuations.filter((v) => !v.setAside).sort(byNewest);
  if (account.conflict) {
    const conflicting = account.conflict.valuationIds
      .map((vid) => vals.find((v) => v.id === vid))
      .filter((v): v is Valuation => Boolean(v));
    if (conflicting.length >= 2) return { status: "conflicting", conflicting };
  }
  if (vals.length === 0) {
    return { status: account.awaitingStatement ? "waiting_for_statement" : "not_entered", conflicting: [] };
  }
  const latestVerified = vals.find((v) => v.confidence === "verified");
  if (latestVerified) {
    const newer = vals.find((v) => v.confidence === "estimated" && byNewest(v, latestVerified) < 0);
    let status: VerificationStatus = "verified";
    if (account.awaitingStatement) status = "waiting_for_statement";
    else if (daysBetween(latestVerified.valuationDate, today) > staleDays) status = "outdated";
    return { status, current: latestVerified, latestVerified, newerEstimate: newer, conflicting: [] };
  }
  const latest = vals[0]!;
  return {
    status: account.awaitingStatement ? "waiting_for_statement" : "estimated",
    current: latest,
    conflicting: [],
  };
}

export const isLiability = (a: Account) => a.assetClass === "liability";

export function activeAccounts(state: LedgerState): Account[] {
  return state.accounts.filter((a) => !a.archivedAt);
}

/**
 * True when this account's value must be skipped in totals because it is
 * already included in an active parent's value (e.g. holdings inside a
 * managed portfolio). Prevents double counting.
 */
export function isCountedElsewhere(account: Account, state: LedgerState): boolean {
  if (!account.parentId || !account.includedInParentValue) return false;
  const parent = state.accounts.find((a) => a.id === account.parentId);
  return Boolean(parent && !parent.archivedAt);
}

export interface Totals {
  assetsMinor: MinorUnits;
  liabilitiesMinor: MinorUnits;
  netWorthMinor: MinorUnits;
  verifiedAssetsMinor: MinorUnits;
  unverifiedAssetsMinor: MinorUnits;
  /** Approved credit limits — shown for information, never subtracted. */
  creditLimitsMinor: MinorUnits;
  countedAccountIds: string[];
  missingValueIds: string[];
  conflictingIds: string[];
  skippedAsChildIds: string[];
  /** False whenever any relevant value is missing or disputed. */
  isComplete: boolean;
  lastUpdated?: string;
}

export function computeTotals(state: LedgerState, today: string, filter?: (a: Account) => boolean): Totals {
  let assets = 0n;
  let liabilities = 0n;
  let verified = 0n;
  let creditLimits = 0n;
  const counted: string[] = [];
  const missing: string[] = [];
  const conflicting: string[] = [];
  const skipped: string[] = [];
  let lastUpdated: string | undefined;

  for (const account of activeAccounts(state)) {
    if (filter && !filter(account)) continue;
    if (account.lifecycle === "closed") continue;
    if (isCountedElsewhere(account, state)) {
      skipped.push(account.id);
      continue;
    }
    if (account.creditLimitMinor) creditLimits += toBig(account.creditLimitMinor);
    const view = deriveValue(account, today);
    if (view.status === "conflicting") {
      conflicting.push(account.id);
      continue;
    }
    if (!view.current) {
      missing.push(account.id);
      continue;
    }
    if (view.current.currency !== state.baseCurrency) {
      // Multi-currency conversion is a future feature; never mix currencies silently.
      missing.push(account.id);
      continue;
    }
    counted.push(account.id);
    const amount = toBig(view.current.amountMinor);
    if (isLiability(account)) liabilities += amount;
    else {
      assets += amount;
      if (view.current.confidence === "verified" && view.status !== "outdated") verified += amount;
    }
    if (!lastUpdated || view.current.enteredAt > lastUpdated) lastUpdated = view.current.enteredAt;
  }

  return {
    assetsMinor: fromBig(assets),
    liabilitiesMinor: fromBig(liabilities),
    netWorthMinor: fromBig(assets - liabilities),
    verifiedAssetsMinor: fromBig(verified),
    unverifiedAssetsMinor: fromBig(assets - verified),
    creditLimitsMinor: fromBig(creditLimits),
    countedAccountIds: counted,
    missingValueIds: missing,
    conflictingIds: conflicting,
    skippedAsChildIds: skipped,
    isComplete: missing.length === 0 && conflicting.length === 0,
    lastUpdated,
  };
}

export type BreakdownDimension = "assetClass" | "institution" | "manager" | "liquidity" | "verification" | "owner";

export interface BreakdownRow {
  key: string;
  label: string;
  amountMinor: MinorUnits;
  accountIds: string[];
  missingCount: number;
}

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  listed_equity: "Shares",
  mutual_funds: "Mutual funds",
  managed_portfolio: "Managed portfolios",
  fixed_deposit: "Fixed deposits",
  savings: "Savings",
  provident_fund: "Provident fund",
  insurance_investment: "Insurance investments",
  gold: "Gold",
  real_estate: "Property",
  bonds: "Bonds",
  cash: "Cash",
  other: "Other",
  liability: "Loans & overdrafts",
};

export const LIQUIDITY_LABELS: Record<Liquidity, string> = {
  liquid: "Can be withdrawn easily",
  restricted: "Some restrictions",
  locked: "Locked until a date or event",
  unknown: "Not sure yet",
};

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  not_entered: "Not yet entered",
  estimated: "Estimated",
  waiting_for_statement: "Waiting for statement",
  verified: "Verified",
  outdated: "Needs a fresh check",
  conflicting: "Amounts don't agree",
};

/**
 * Asset breakdown along one independent dimension. Liabilities and
 * double-counted child holdings are excluded. Accounts without a usable value
 * are listed with a zero contribution and counted in missingCount.
 */
export function breakdown(state: LedgerState, dimension: BreakdownDimension, today: string): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  const personName = (pid?: string) => state.people.find((p) => p.id === pid)?.name;

  const keysFor = (a: Account, status: VerificationStatus): Array<[string, string]> => {
    switch (dimension) {
      case "assetClass":
        return [[a.assetClass, ASSET_CLASS_LABELS[a.assetClass]]];
      case "institution":
        return [[a.institution?.toLowerCase() || "_none", a.institution || "Not recorded"]];
      case "manager":
        return a.managedByPersonId
          ? [[a.managedByPersonId, personName(a.managedByPersonId) ?? "Someone"]]
          : [["_self", "Managed by the family"]];
      case "liquidity":
        return [[a.liquidity, LIQUIDITY_LABELS[a.liquidity]]];
      case "verification":
        return [[status, VERIFICATION_LABELS[status]]];
      case "owner": {
        const ids =
          a.ownership.owners.length > 0 ? a.ownership.owners.map((o) => o.personId) : a.ownership.associatedPersonIds;
        if (ids.length === 0) return [["_unknown", "Owner not recorded"]];
        if (ids.length > 1) {
          const names = ids.map((i) => personName(i) ?? "?").join(" & ");
          return [[`joint:${[...ids].sort().join("+")}`, `Joint: ${names}`]];
        }
        return [[ids[0]!, personName(ids[0]) ?? "Someone"]];
      }
    }
  };

  for (const a of activeAccounts(state)) {
    if (isLiability(a) || a.lifecycle === "closed" || isCountedElsewhere(a, state)) continue;
    const view = deriveValue(a, today);
    for (const [key, label] of keysFor(a, view.status)) {
      const row = rows.get(key) ?? { key, label, amountMinor: "0", accountIds: [], missingCount: 0 };
      row.accountIds.push(a.id);
      if (view.current && view.current.currency === state.baseCurrency) {
        row.amountMinor = fromBig(toBig(row.amountMinor) + toBig(view.current.amountMinor));
      } else {
        row.missingCount += 1;
      }
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((x, y) => {
    const diff = toBig(y.amountMinor) - toBig(x.amountMinor);
    return diff > 0n ? 1 : diff < 0n ? -1 : x.label.localeCompare(y.label);
  });
}

export interface PersonView {
  personId: string;
  /** Sole ownership plus confirmed shares of joint accounts. */
  attributedMinor: MinorUnits;
  soleAccountIds: string[];
  confirmedShareAccountIds: string[];
  /** Joint or unconfirmed accounts — full value shown, but not split. */
  sharedUnallocatedAccountIds: string[];
  missingValueIds: string[];
}

/**
 * A personal ownership view. Only confirmed ownership with confirmed shares is
 * attributed; everything else is listed separately so we never imply a split
 * the family hasn't agreed.
 */
export function personView(state: LedgerState, personId: string, today: string): PersonView {
  let attributed = 0n;
  const out: PersonView = {
    personId,
    attributedMinor: "0",
    soleAccountIds: [],
    confirmedShareAccountIds: [],
    sharedUnallocatedAccountIds: [],
    missingValueIds: [],
  };
  for (const a of activeAccounts(state)) {
    if (isLiability(a) || a.lifecycle === "closed" || isCountedElsewhere(a, state)) continue;
    const owner = a.ownership.owners.find((o) => o.personId === personId);
    const associated = a.ownership.associatedPersonIds.includes(personId);
    if (!owner && !associated) continue;
    const view = deriveValue(a, today);
    const amount = view.current ? toBig(view.current.amountMinor) : null;
    if (amount === null) out.missingValueIds.push(a.id);

    const confirmed = a.ownership.status === "confirmed" && owner;
    if (confirmed && a.ownership.owners.length === 1) {
      out.soleAccountIds.push(a.id);
      if (amount !== null) attributed += amount;
    } else if (confirmed && owner.sharePercent) {
      out.confirmedShareAccountIds.push(a.id);
      if (amount !== null) attributed += applyPercent(amount, owner.sharePercent);
    } else {
      out.sharedUnallocatedAccountIds.push(a.id);
    }
  }
  out.attributedMinor = fromBig(attributed);
  return out;
}

/** amount × pct/100 with pct up to two decimals; rounds down to the paisa. */
export function applyPercent(amount: bigint, pct: string): bigint {
  const [w = "0", f = ""] = pct.split(".");
  const hundredths = BigInt(w) * 100n + BigInt((f + "00").slice(0, 2));
  return (amount * hundredths) / 10_000n;
}

export interface UpcomingDate {
  accountId: string;
  date: string;
  daysAway: number;
  confirmed: boolean;
}

export function upcomingMaturities(state: LedgerState, today: string, withinDays = 120): UpcomingDate[] {
  return activeAccounts(state)
    .filter((a) => a.maturityDate)
    .map((a) => ({
      accountId: a.id,
      date: a.maturityDate!,
      daysAway: daysBetween(today, a.maturityDate!),
      confirmed: a.maturityDateConfirmed,
    }))
    .filter((u) => u.daysAway >= -30 && u.daysAway <= withinDays)
    .sort((x, y) => x.daysAway - y.daysAway);
}

export type AttentionReason =
  | "not_entered"
  | "outdated"
  | "conflicting"
  | "waiting_for_statement"
  | "ownership_unclear"
  | "maturity_unconfirmed"
  | "product_unclear";

export interface AttentionItem {
  accountId: string;
  reason: AttentionReason;
}

export const ATTENTION_LABELS: Record<AttentionReason, string> = {
  not_entered: "Amount not yet entered",
  outdated: "Amount needs a fresh check",
  conflicting: "Two amounts don't agree",
  waiting_for_statement: "Waiting for a statement",
  ownership_unclear: "Whose name is it in?",
  maturity_unconfirmed: "Maturity date not confirmed",
  product_unclear: "What kind of product is this?",
};

/** Things the family might want to check, derived from the records themselves. */
export function attentionItems(state: LedgerState, today: string): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const a of activeAccounts(state)) {
    if (a.lifecycle === "closed") continue;
    const view = deriveValue(a, today);
    if (!isCountedElsewhere(a, state)) {
      if (view.status === "not_entered") items.push({ accountId: a.id, reason: "not_entered" });
      if (view.status === "outdated") items.push({ accountId: a.id, reason: "outdated" });
      if (view.status === "conflicting") items.push({ accountId: a.id, reason: "conflicting" });
      if (view.status === "waiting_for_statement") items.push({ accountId: a.id, reason: "waiting_for_statement" });
    }
    if (a.ownership.status === "unknown" || a.ownership.status === "disputed")
      items.push({ accountId: a.id, reason: "ownership_unclear" });
    if (a.maturityDate && !a.maturityDateConfirmed) items.push({ accountId: a.id, reason: "maturity_unconfirmed" });
    if (a.productTypeNote && /clarif|unclear|unsure|not sure/i.test(a.productTypeNote))
      items.push({ accountId: a.id, reason: "product_unclear" });
  }
  return items;
}
