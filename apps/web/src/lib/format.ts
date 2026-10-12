import { formatINR, formatINRShort, isMinorUnits, type LedgerState } from "@family-ledger/shared";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeParts = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});
const dateIst = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/** "12 Oct 2026" for a plain YYYY-MM-DD date. */
export function formatDate(isoDate: string | undefined): string {
  if (!isoDate) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? new Date(`${isoDate}T00:00:00Z`) : null;
  if (d && !Number.isNaN(d.getTime())) return dateFmt.format(d).replace(/,/g, "");
  return formatDay(isoDate);
}

/** "12 Oct 2026" for a timestamp, in India time. */
export function formatDay(isoDateTime: string | undefined): string {
  if (!isoDateTime) return "";
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return "";
  return dateIst.format(d).replace(/,/g, "");
}

/** "12 Oct 2026, 4:05 pm" in India time. */
export function formatDateTime(isoDateTime: string | undefined): string {
  if (!isoDateTime) return "";
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return "";
  const parts = Object.fromEntries(dateTimeParts.formatToParts(d).map((p) => [p.type, p.value]));
  const dayPeriod = (parts.dayPeriod ?? "").toLowerCase().replace(/\./g, "");
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${dayPeriod}`.trim();
}

/** "today", "yesterday", "3 days ago", else the date. */
export function formatRelative(isoDateTime: string | undefined, now = new Date()): string {
  if (!isoDateTime) return "";
  const d = new Date(isoDateTime);
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0 && now.getDate() === d.getDate()) return "today";
  if (days <= 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDay(isoDateTime);
}

export function inr(minor: string | undefined): string {
  if (!minor || !isMinorUnits(minor)) return "";
  return formatINR(minor);
}

export function inrShort(minor: string | undefined): string {
  if (!minor || !isMinorUnits(minor)) return "";
  return formatINRShort(minor);
}

export function memberName(ledger: LedgerState | undefined, memberId: string | undefined): string {
  if (!memberId) return "Someone";
  return ledger?.members.find((m) => m.id === memberId)?.displayName ?? "Someone";
}

export function personName(ledger: LedgerState | undefined, personId: string | undefined): string {
  if (!personId) return "Someone";
  return ledger?.people.find((p) => p.id === personId)?.name ?? "Someone";
}

/** Member display name for a person id, if that person is a family member. */
export function memberIdForPerson(ledger: LedgerState | undefined, personId: string): string | undefined {
  return ledger?.people.find((p) => p.id === personId)?.memberId;
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
