import { useId } from "react";
import { formatINR, formatINRShort, parseRupeesInput } from "@family-ledger/shared";
import { Input } from "./ui/field";

/** Result of reading what someone typed: paise, or null if we couldn't understand it. */
export function readAmount(text: string): { minor: string | null; preview: string | null } {
  if (!text.trim()) return { minor: null, preview: null };
  const minor = parseRupeesInput(text);
  if (minor === null) return { minor: null, preview: null };
  return { minor, preview: `${formatINR(minor)} · ${formatINRShort(minor)}` };
}

/**
 * Accepts "25 lakh", "1.5 crore", "25,00,000" or "₹12,345.50" and shows a
 * live, friendly preview so the family can be sure of the number.
 */
export function MoneyInput({
  label,
  value,
  onChange,
  hint = "You can type 25,00,000 or 25 lakh or 1.5 crore.",
  error,
  allowNegative = false,
  autoFocus,
  name,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  hint?: string;
  error?: string;
  allowNegative?: boolean;
  autoFocus?: boolean;
  name?: string;
}) {
  const id = useId();
  const { minor, preview } = readAmount(value);
  const negative = minor !== null && minor.startsWith("-");
  const problem =
    error ??
    (value.trim() && minor === null
      ? "We couldn't read that amount. Try something like 25 lakh or 25,00,000."
      : negative && !allowNegative
        ? "Please enter the amount without a minus sign."
        : undefined);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-semibold text-ink">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-[0.9375rem] text-muted">
        {hint}
      </p>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl text-muted">
          ₹
        </span>
        <Input
          id={id}
          name={name}
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(problem)}
          aria-describedby={`${id}-hint ${id}-preview`}
          className="min-h-16 pl-10 text-2xl font-semibold tabular"
          placeholder="25 lakh"
        />
      </div>
      <p id={`${id}-preview`} aria-live="polite" className="min-h-7 text-[1.0625rem]">
        {problem ? (
          <span role="alert" className="font-medium text-con-ink">
            {problem}
          </span>
        ) : preview ? (
          <span className="font-semibold text-accent tabular">That's {preview}</span>
        ) : null}
      </p>
    </div>
  );
}
