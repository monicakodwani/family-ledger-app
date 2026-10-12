import type { Command } from "./commands";
import type { ValuationSource } from "./schema";

/**
 * Boundary for future automated updates (account aggregators, consolidated
 * mutual fund statements, broker reports, market prices). V1 ships ONLY mock
 * providers. Real providers must use official, authorised APIs — never
 * scraping, automated logins, OTP capture, or stored banking passwords.
 *
 * A provider never writes directly: it proposes valuations, which become
 * ordinary audited `valuation.add` commands attributed to the member who ran
 * the sync. Price-derived values are always "estimated", never "verified".
 */
export type SyncDataType = "account_balance" | "holdings_value" | "price_estimate" | "statement_import";

export interface SyncedValue {
  accountId: string;
  amountMinor: string;
  currency: string;
  valuationDate: string;
  dataType: SyncDataType;
  /** Officially confirmed by the institution (e.g. a signed statement), vs derived. */
  confirmedByInstitution: boolean;
}

export interface SyncResult {
  provider: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  values: SyncedValue[];
  errors: Array<{ accountId?: string; message: string }>;
}

export interface SyncProvider {
  readonly id: string;
  readonly displayName: string;
  readonly dataTypes: SyncDataType[];
  readonly isMock: boolean;
  fetch(accountIds: string[], now: Date): Promise<SyncResult>;
}

const SOURCE_FOR: Record<SyncDataType, ValuationSource> = {
  account_balance: "sync",
  holdings_value: "sync",
  price_estimate: "estimate",
  statement_import: "statement",
};

/** Turn a sync result into audited commands. Only institution-confirmed balances may be "verified". */
export function syncResultToCommands(result: SyncResult): Command[] {
  return result.values.map((v) => ({
    type: "valuation.add" as const,
    accountId: v.accountId,
    valuation: {
      amountMinor: v.amountMinor,
      currency: v.currency,
      valuationDate: v.valuationDate,
      source: SOURCE_FOR[v.dataType],
      sourceNote: `${result.provider} · ${v.dataType.replace("_", " ")}${v.confirmedByInstitution ? "" : " (not confirmed by the institution)"}`,
      confidence:
        v.confirmedByInstitution && v.dataType !== "price_estimate" ? ("verified" as const) : ("estimated" as const),
    },
  }));
}

/** Deterministic fake provider for demos and tests. Produces clearly labelled estimates. */
export class MockPriceProvider implements SyncProvider {
  readonly id = "mock-prices";
  readonly displayName = "Sample market prices (mock)";
  readonly dataTypes: SyncDataType[] = ["price_estimate"];
  readonly isMock = true;

  constructor(private amounts: Record<string, string>) {}

  async fetch(accountIds: string[], now: Date): Promise<SyncResult> {
    const at = now.toISOString();
    const values: SyncedValue[] = [];
    const errors: SyncResult["errors"] = [];
    for (const accountId of accountIds) {
      const amountMinor = this.amounts[accountId];
      if (!amountMinor) errors.push({ accountId, message: "No sample price for this account" });
      else
        values.push({
          accountId,
          amountMinor,
          currency: "INR",
          valuationDate: at.slice(0, 10),
          dataType: "price_estimate",
          confirmedByInstitution: false,
        });
    }
    return { provider: this.displayName, startedAt: at, finishedAt: at, ok: errors.length === 0, values, errors };
  }
}
