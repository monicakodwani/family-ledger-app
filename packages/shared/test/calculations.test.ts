import { describe, expect, it } from "vitest";
import { attentionItems, breakdown, computeTotals, deriveValue, personView } from "../src";
import { run, seed, withValue } from "./helpers";

const TODAY = "2026-10-12";

describe("totals with missing data", () => {
  it("never treats missing values as zero and marks totals partial", () => {
    const state = seed();
    const totals = computeTotals(state, TODAY);
    expect(totals.isComplete).toBe(false);
    expect(totals.countedAccountIds).toHaveLength(0);
    expect(totals.missingValueIds.length).toBeGreaterThan(10);
  });

  it("subtracts outstanding debt but never the approved credit limit", () => {
    let state = seed();
    state = withValue(state, "acc_fd", "4000000000");
    let totals = computeTotals(state, TODAY);
    expect(totals.liabilitiesMinor).toBe("0");
    expect(totals.creditLimitsMinor).toBe("250000000");
    expect(totals.netWorthMinor).toBe("4000000000");
    expect(totals.missingValueIds).toContain("acc_fd_overdraft");

    state = withValue(state, "acc_fd_overdraft", "600000000");
    totals = computeTotals(state, TODAY);
    expect(totals.liabilitiesMinor).toBe("600000000");
    expect(totals.netWorthMinor).toBe("3400000000");
  });
});

describe("double counting", () => {
  it("skips child holdings already included in the parent value", () => {
    let state = seed();
    const child = run(state, {
      type: "account.create",
      data: {
        displayName: "HDFC fund inside Rohit portfolio",
        assetClass: "mutual_funds",
        parentId: "acc_rohit_portfolio",
        includedInParentValue: true,
      },
    });
    state = child.state;
    state = withValue(state, "acc_rohit_portfolio", "1000000000");
    state = withValue(state, child.entityId, "400000000");
    const totals = computeTotals(state, TODAY);
    expect(totals.assetsMinor).toBe("1000000000");
    expect(totals.skippedAsChildIds).toContain(child.entityId);
    const byClass = breakdown(state, "assetClass", TODAY);
    expect(byClass.find((r) => r.key === "mutual_funds")?.accountIds).not.toContain(child.entityId);
  });

  it("counts a child separately when it is NOT part of the parent value", () => {
    let state = seed();
    const child = run(state, {
      type: "account.create",
      data: {
        displayName: "Separate",
        assetClass: "cash",
        parentId: "acc_rohit_portfolio",
        includedInParentValue: false,
      },
    });
    state = withValue(child.state, child.entityId, "500");
    state = withValue(state, "acc_rohit_portfolio", "1000");
    expect(computeTotals(state, TODAY).assetsMinor).toBe("1500");
  });
});

describe("verification status", () => {
  it("does not let a newer estimate replace a verified value", () => {
    let state = seed();
    state = withValue(state, "acc_icici_mf", "900000000", "verified", "2026-09-01");
    state = withValue(state, "acc_icici_mf", "990000000", "estimated", "2026-10-10");
    const view = deriveValue(
      state.accounts.find((a) => a.id === "acc_icici_mf")!,
      TODAY,
    );
    expect(view.status).toBe("verified");
    expect(view.current?.amountMinor).toBe("900000000");
    expect(view.newerEstimate?.amountMinor).toBe("990000000");
  });

  it("marks old verified values as outdated and excludes them from verified totals", () => {
    const state = withValue(seed(), "acc_icici_mf", "1000", "verified", "2025-01-01");
    const view = deriveValue(
      state.accounts.find((a) => a.id === "acc_icici_mf")!,
      TODAY,
    );
    expect(view.status).toBe("outdated");
    expect(computeTotals(state, TODAY).verifiedAssetsMinor).toBe("0");
  });

  it("keeps both claims when verified amounts conflict, and leaves them out of totals", () => {
    let state = seed();
    state = withValue(state, "acc_nokia_pf", "1000", "verified", "2026-10-01");
    state = withValue(state, "acc_nokia_pf", "2000", "verified", "2026-10-01");
    const acc = state.accounts.find((a) => a.id === "acc_nokia_pf")!;
    const view = deriveValue(acc, TODAY);
    expect(view.status).toBe("conflicting");
    expect(view.conflicting.map((v) => v.amountMinor).sort()).toEqual(["1000", "2000"]);
    expect(computeTotals(state, TODAY).conflictingIds).toContain("acc_nokia_pf");

    const keep = acc.valuations.find((v) => v.amountMinor === "2000")!;
    state = run(state, {
      type: "valuation.resolveConflict",
      accountId: "acc_nokia_pf",
      keepValuationId: keep.id,
    }).state;
    const resolved = state.accounts.find((a) => a.id === "acc_nokia_pf")!;
    expect(deriveValue(resolved, TODAY).current?.amountMinor).toBe("2000");
    expect(resolved.valuations).toHaveLength(2); // history preserved
  });

  it("shows waiting for statement", () => {
    const state = run(seed(), {
      type: "account.setAwaitingStatement",
      id: "acc_amit_seth_portfolio",
      value: true,
    }).state;
    expect(
      deriveValue(
        state.accounts.find((a) => a.id === "acc_amit_seth_portfolio")!,
        TODAY,
      ).status,
    ).toBe("waiting_for_statement");
  });
});

describe("ownership views", () => {
  it("only attributes confirmed shares and lists the rest as shared", () => {
    let state = seed();
    state = withValue(state, "acc_icici_mf", "1000000");
    state = withValue(state, "acc_rohit_portfolio", "3000000");
    const acc = state.accounts.find((a) => a.id === "acc_rohit_portfolio")!;
    state = run(state, {
      type: "account.update",
      id: acc.id,
      expectedVersion: acc.version,
      patch: {
        ownership: {
          status: "confirmed",
          owners: [
            { personId: "p_mumma", sharePercent: "50" },
            { personId: "p_papa", sharePercent: "50" },
          ],
          associatedPersonIds: [],
        },
      },
    }).state;
    const papa = personView(state, "p_papa", TODAY);
    expect(papa.attributedMinor).toBe("1500000"); // 50% of Rohit; ICICI unconfirmed
    expect(papa.sharedUnallocatedAccountIds).toContain("acc_icici_mf");
  });
});

describe("attention items", () => {
  it("lists unknown values and unclear product types", () => {
    const items = attentionItems(seed(), TODAY);
    expect(items.some((i) => i.accountId === "acc_mumma_ppo" && i.reason === "product_unclear")).toBe(true);
    expect(items.some((i) => i.accountId === "acc_gold" && i.reason === "ownership_unclear")).toBe(true);
  });
});
