import { applyCommand, createSeedState, type Command, type LedgerState } from "../src";

let counter = 0;
export const ctx = (actorId = "m_me", now = "2026-10-12T05:00:00.000Z") => ({
  actorId,
  now,
  newId: () => `id_${++counter}`,
});

export function run(state: LedgerState, command: Command, actorId = "m_me", now?: string) {
  return applyCommand(state, command, ctx(actorId, now));
}

export function seed() {
  return createSeedState();
}

export function withValue(
  state: LedgerState,
  accountId: string,
  amountMinor: string,
  confidence: "estimated" | "verified" = "verified",
  valuationDate = "2026-10-01",
) {
  return run(state, {
    type: "valuation.add",
    accountId,
    valuation: { amountMinor, valuationDate, source: confidence === "verified" ? "statement" : "estimate", confidence },
  }).state;
}
