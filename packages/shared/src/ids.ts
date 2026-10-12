export function newId(): string {
  return crypto.randomUUID();
}

/** Today's date (YYYY-MM-DD) in India Standard Time, which the family lives in. */
export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}
