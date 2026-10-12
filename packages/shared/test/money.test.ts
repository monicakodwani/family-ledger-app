import { describe, expect, it } from "vitest";
import { addMinor, formatINR, formatINRShort, parseRupeesInput, subMinor } from "../src";

describe("money", () => {
  it("parses Indian-style input without floating point", () => {
    expect(parseRupeesInput("25,00,000")).toBe("250000000");
    expect(parseRupeesInput("₹ 12,345.50")).toBe("1234550");
    expect(parseRupeesInput("25 lakh")).toBe("250000000");
    expect(parseRupeesInput("1.5 crore")).toBe("1500000000");
    expect(parseRupeesInput("0.1")).toBe("10");
    expect(parseRupeesInput("2.675")).toBe("268"); // rounds half up at the paisa
    expect(parseRupeesInput("abc")).toBeNull();
    expect(parseRupeesInput("")).toBeNull();
    expect(parseRupeesInput("1e5")).toBeNull();
  });

  it("adds exactly where floats would drift", () => {
    // 0.1 + 0.2 in rupees
    expect(addMinor("10", "20")).toBe("30");
    expect(addMinor(...Array(10).fill("10"))).toBe("100");
    expect(subMinor("100", "250")).toBe("-150");
  });

  it("formats with Indian digit grouping and units", () => {
    expect(formatINR("12345678950")).toBe("₹12,34,56,789.50");
    expect(formatINR("100000")).toBe("₹1,000");
    expect(formatINR("-5000")).toBe("−₹50");
    expect(formatINRShort("250000000")).toBe("₹25 lakh");
    expect(formatINRShort("1250000000")).toBe("₹1.25 crore");
    expect(formatINRShort("4800000")).toBe("₹48,000");
    // Never rounds up a short label
    expect(formatINRShort("999999900")).toBe("₹99.99 lakh");
  });
});
