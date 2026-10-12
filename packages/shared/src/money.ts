/**
 * Money is stored as an integer number of minor units (paise for INR),
 * serialised as a decimal-integer string so it survives JSON without
 * floating-point loss. All arithmetic uses BigInt.
 */

export type MinorUnits = string; // e.g. "250000000" = ₹25,00,000.00

const MINOR_RE = /^-?\d{1,18}$/;

export function isMinorUnits(value: string): boolean {
  return MINOR_RE.test(value);
}

export function toBig(value: MinorUnits): bigint {
  if (!isMinorUnits(value)) throw new Error("Invalid minor-unit amount");
  return BigInt(value);
}

export function fromBig(value: bigint): MinorUnits {
  return value.toString();
}

export function addMinor(...values: MinorUnits[]): MinorUnits {
  return fromBig(values.reduce((acc, v) => acc + toBig(v), 0n));
}

export function subMinor(a: MinorUnits, b: MinorUnits): MinorUnits {
  return fromBig(toBig(a) - toBig(b));
}

/**
 * Parse what a person types ("25,00,000", "25 lakh", "1.5 crore", "₹ 12,345.50")
 * into paise. Returns null when the input cannot be understood. Never uses
 * floating point: the decimal part is handled as a string.
 */
export function parseRupeesInput(raw: string): MinorUnits | null {
  let text = raw
    .trim()
    .toLowerCase()
    .replace(/₹|rs\.?|inr/g, "")
    .replace(/[,\s]/g, "");
  if (!text) return null;

  let multiplier = 1n;
  const unitMatch = text.match(/(lakhs?|lacs?|l|crores?|cr|k|thousand)$/);
  if (unitMatch) {
    const unit = unitMatch[1]!;
    text = text.slice(0, -unit.length);
    if (unit.startsWith("cr")) multiplier = 10_000_000n;
    else if (unit === "k" || unit === "thousand") multiplier = 1_000n;
    else multiplier = 100_000n;
  }

  const negative = text.startsWith("-");
  if (negative) text = text.slice(1);
  if (!/^\d+(\.\d+)?$/.test(text)) return null;

  const [whole = "0", frac = ""] = text.split(".");
  // Scale the decimal fraction exactly: value = (whole + frac/10^n) * multiplier * 100 paise
  const fracDigits = BigInt(frac.length);
  const scale = 10n ** fracDigits;
  const numerator = (BigInt(whole) * scale + BigInt(frac || "0")) * multiplier * 100n;
  if (numerator % scale !== 0n) {
    // Sub-paisa precision is not meaningful; round half up to the nearest paisa.
    const rounded = (numerator * 2n + scale) / (2n * scale);
    return fromBig(negative ? -rounded : rounded);
  }
  const paise = numerator / scale;
  if (paise > 10n ** 17n) return null;
  return fromBig(negative ? -paise : paise);
}

/** Group digits Indian-style: 1,23,45,678 */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${parts.join(",")},${last3}`;
}

/** ₹1,23,45,678.50 — exact, no floating point. */
export function formatINR(value: MinorUnits, opts: { paise?: boolean } = {}): string {
  const big = toBig(value);
  const negative = big < 0n;
  const abs = negative ? -big : big;
  const rupees = abs / 100n;
  const paise = abs % 100n;
  const showPaise = opts.paise ?? paise !== 0n;
  const body = groupIndian(rupees.toString()) + (showPaise ? `.${paise.toString().padStart(2, "0")}` : "");
  return `${negative ? "−" : ""}₹${body}`;
}

/**
 * Friendly short form: ₹25 lakh, ₹1.25 crore, ₹48,000.
 * Truncates (never rounds up) to two decimals so a short label never
 * overstates the exact amount.
 */
export function formatINRShort(value: MinorUnits): string {
  const big = toBig(value);
  const negative = big < 0n;
  const rupees = (negative ? -big : big) / 100n;
  const sign = negative ? "−" : "";
  const fmt = (unit: bigint, label: string) => {
    const whole = rupees / unit;
    const hundredths = ((rupees % unit) * 100n) / unit;
    const dec = hundredths === 0n ? "" : `.${hundredths.toString().padStart(2, "0").replace(/0$/, "")}`;
    return `${sign}₹${groupIndian(whole.toString())}${dec} ${label}`;
  };
  if (rupees >= 10_000_000n) return fmt(10_000_000n, "crore");
  if (rupees >= 100_000n) return fmt(100_000n, "lakh");
  return `${sign}₹${groupIndian(rupees.toString())}`;
}

/** Ratio of a/b as a whole-number percentage (0–100), for display only. */
export function percentOf(part: MinorUnits, whole: MinorUnits): number {
  const w = toBig(whole);
  if (w === 0n) return 0;
  return Number((toBig(part) * 1000n) / w) / 10;
}
