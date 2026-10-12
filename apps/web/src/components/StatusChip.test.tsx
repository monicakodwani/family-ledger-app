import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import type { VerificationStatus } from "@family-ledger/shared";
import { StatusChip } from "./StatusChip";

describe("StatusChip", () => {
  it.each<[VerificationStatus, string]>([
    ["not_entered", "Not yet entered"],
    ["estimated", "Estimated"],
    ["waiting_for_statement", "Waiting for statement"],
    ["verified", "Verified"],
    ["outdated", "Needs a fresh check"],
    ["conflicting", "Amounts don't agree"],
  ])("%s shows words and an icon, never colour alone", (status, text) => {
    const { container } = render(<StatusChip status={status} />);
    expect(container.textContent).toBe(text);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden");
  });
});
