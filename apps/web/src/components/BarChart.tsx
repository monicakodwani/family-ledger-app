import { useId } from "react";
import { Link } from "react-router";
import { formatINR, formatINRShort, percentOf, toBig, addMinor } from "@family-ledger/shared";
import { cn } from "../lib/cn";

export interface BarRow {
  key: string;
  label: string;
  amountMinor: string;
  /** e.g. "2 accounts without amounts" */
  note?: string;
  href?: string;
}

const COLOURS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

/**
 * Calm horizontal bars. The bars are decorative (aria-hidden); every number is
 * also written as text, and a plain table version is always one tap away.
 */
export function BarChart({ title, rows, caption }: { title: string; rows: BarRow[]; caption?: string }) {
  const id = useId();
  const max = rows.reduce((m, r) => (toBig(r.amountMinor) > m ? toBig(r.amountMinor) : m), 0n);
  const total = rows.length ? addMinor(...rows.map((r) => r.amountMinor)) : "0";
  return (
    <figure className="m-0" aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="sr-only">
        {title}
      </figcaption>
      <ul className="space-y-4">
        {rows.map((row, i) => {
          const width = max > 0n ? Number((toBig(row.amountMinor) * 1000n) / max) / 10 : 0;
          const share = percentOf(row.amountMinor, total);
          const label = row.href ? (
            <Link
              to={row.href}
              className="font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent"
            >
              {row.label}
            </Link>
          ) : (
            <span className="font-semibold text-ink">{row.label}</span>
          );
          return (
            <li key={row.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0">{label}</span>
                <span className="tabular font-semibold whitespace-nowrap text-ink">
                  {toBig(row.amountMinor) > 0n ? formatINRShort(row.amountMinor) : "—"}
                  {toBig(total) > 0n && toBig(row.amountMinor) > 0n && (
                    <span className="ml-1.5 font-normal text-muted">({share}%)</span>
                  )}
                </span>
              </div>
              <div aria-hidden className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-cream-deep">
                <div
                  className={cn("h-full rounded-full", COLOURS[i % COLOURS.length])}
                  style={{ width: `${Math.max(width, toBig(row.amountMinor) > 0n ? 2 : 0)}%` }}
                />
              </div>
              {row.note && <p className="mt-1 text-[0.9375rem] text-muted">{row.note}</p>}
            </li>
          );
        })}
      </ul>
      <details className="mt-4 rounded-xl bg-cream px-4 py-2">
        <summary className="min-h-11 cursor-pointer py-2.5 font-semibold text-accent">Show as a table</summary>
        <table className="mt-2 mb-2 w-full border-collapse text-left text-[0.9375rem]">
          <caption className="sr-only">{caption ?? title}</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-2 font-semibold">
                Group
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line/70 align-top">
                <th scope="row" className="py-2 pr-2 font-normal">
                  {r.label}
                  {r.note && <span className="block text-muted">{r.note}</span>}
                </th>
                <td className="py-2 text-right tabular">
                  {toBig(r.amountMinor) > 0n ? formatINR(r.amountMinor) : "Not yet entered"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Two-part split bar (e.g. verified vs estimated) with a text legend. */
export function SplitBar({
  parts,
  label,
}: {
  label: string;
  parts: Array<{ label: string; amountMinor: string; tone: "verified" | "estimated" | "accent" | "muted" | "rose" }>;
}) {
  const total = parts.length ? addMinor(...parts.map((p) => p.amountMinor)) : "0";
  const tones = {
    verified: "bg-[#6f9c76]",
    estimated: "bg-[#d9a94f]",
    accent: "bg-chart-1",
    muted: "bg-chart-5",
    rose: "bg-[#c9848c]",
  };
  return (
    <div>
      <div aria-hidden className="flex h-3.5 w-full overflow-hidden rounded-full bg-cream-deep">
        {toBig(total) > 0n &&
          parts.map((p) => (
            <div
              key={p.label}
              className={cn("h-full", tones[p.tone])}
              style={{ width: `${percentOf(p.amountMinor, total)}%` }}
            />
          ))}
      </div>
      <ul className="mt-3 space-y-1.5" aria-label={label}>
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span aria-hidden className={cn("size-3 rounded-full", tones[p.tone])} />
              {p.label}
            </span>
            <span className="shrink-0 tabular font-semibold whitespace-nowrap">{formatINRShort(p.amountMinor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
