import { useState } from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/dom";
import { render } from "../test/render";
import userEvent from "@testing-library/user-event";
import { MoneyInput, readAmount } from "./MoneyInput";

function Harness() {
  const [v, setV] = useState("");
  return <MoneyInput label="How much is in it now?" value={v} onChange={setV} />;
}

describe("MoneyInput", () => {
  it.each([
    ["25 lakh", "₹25,00,000 · ₹25 lakh"],
    ["1.5 crore", "₹1,50,00,000 · ₹1.5 crore"],
    ["25,00,000", "₹25,00,000 · ₹25 lakh"],
    ["₹12,345.50", "₹12,345.50 · ₹12,345"],
  ])("shows a friendly preview for %s", async (typed, preview) => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("How much is in it now?"), typed);
    expect(screen.getByText(`That's ${preview}`)).toBeInTheDocument();
  });

  it("explains when an amount can't be read", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("How much is in it now?"), "about twenty");
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't read that amount");
    expect(screen.getByLabelText("How much is in it now?")).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects negative amounts by default", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("How much is in it now?"), "-5 lakh");
    expect(screen.getByRole("alert")).toHaveTextContent("without a minus sign");
  });

  it("readAmount returns paise", () => {
    expect(readAmount("25 lakh").minor).toBe("250000000");
    expect(readAmount("").minor).toBeNull();
    expect(readAmount("abc").minor).toBeNull();
  });
});
