import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/dom";
import { render } from "./render";
import userEvent from "@testing-library/user-event";
import { DemoLedgerClient } from "../data/demoClient";
import { demoAuthAdapter } from "../auth/types";
import { ALLOWED_STORAGE_KEYS, setTextSize } from "../lib/prefs";

const demo = new DemoLedgerClient();
vi.mock("../data/createClient", () => ({
  createAppClient: async () => ({ client: demo, auth: demoAuthAdapter }),
}));

const { App } = await import("../App");

describe("no family data is written to device storage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("only UI preference keys are ever written during demo flows", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const idbOpen = typeof indexedDB !== "undefined" ? vi.spyOn(indexedDB, "open") : null;

    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Neeta/ }));
    await screen.findByRole("heading", { level: 1, name: /Neeta$/ });
    await screen.findByText(/Partial — 0 of \d+ accounts have amounts/);

    // Exercise data flows through the same client the UI uses.
    await demo.sendCommand({
      type: "valuation.add",
      accountId: "acc_fd",
      valuation: {
        amountMinor: "4000000000",
        valuationDate: "2026-10-01",
        source: "statement",
        confidence: "verified",
      },
    });
    await demo.sendCommand({ type: "note.create", data: { kind: "note", body: "Private family note" } });
    demo.confirmFreshAuth();
    await demo.revealAccess("acc_rohit_portfolio");
    await demo.fillSampleAmounts();
    setTextSize("large");

    await waitFor(() => expect(document.documentElement.dataset.textSize).toBe("large"));

    for (const [key, value] of setItem.mock.calls) {
      expect(ALLOWED_STORAGE_KEYS).toContain(key);
      expect(String(value)).not.toMatch(/acc_|example\.com|Private family note|amountMinor/);
    }
    expect(setItem.mock.calls.some(([k]) => k === "fl.pref.textSize")).toBe(true);
    expect(window.sessionStorage.length).toBe(0);
    if (idbOpen) expect(idbOpen).not.toHaveBeenCalled();
  });
});
