import { describe, expect, it } from "vitest";
import { MockPriceProvider, deriveValue, syncResultToCommands } from "../src";
import { run, seed } from "./helpers";

describe("sync provider boundary", () => {
  it("never labels a price-derived value as verified", async () => {
    const provider = new MockPriceProvider({ acc_mumma_groww: "312500000" });
    const result = await provider.fetch(["acc_mumma_groww", "acc_gold"], new Date("2026-10-12T00:00:00Z"));
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.accountId).toBe("acc_gold");
    const [cmd] = syncResultToCommands(result);
    let state = seed();
    state = run(state, cmd!).state;
    const acc = state.accounts.find((a) => a.id === "acc_mumma_groww")!;
    expect(acc.valuations[0]!.confidence).toBe("estimated");
    expect(acc.valuations[0]!.sourceNote).toContain("not confirmed");
    expect(deriveValue(acc, "2026-10-12").status).toBe("estimated");
  });

  it("only institution-confirmed balances become verified", () => {
    const cmds = syncResultToCommands({
      provider: "CAS import",
      startedAt: "",
      finishedAt: "",
      ok: true,
      errors: [],
      values: [
        {
          accountId: "a",
          amountMinor: "1",
          currency: "INR",
          valuationDate: "2026-10-01",
          dataType: "statement_import",
          confirmedByInstitution: true,
        },
      ],
    });
    expect(cmds[0]).toMatchObject({ valuation: { confidence: "verified", source: "statement" } });
  });
});
