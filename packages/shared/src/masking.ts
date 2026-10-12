import type { AccessDetails, Account, LedgerState } from "./schema";

const DOT = "•";

export function maskEmail(value?: string): string | undefined {
  if (!value) return value;
  const [user = "", domain = ""] = value.split("@");
  if (!domain) return maskText(value);
  const [host = "", ...tld] = domain.split(".");
  return `${user.slice(0, 1)}${DOT.repeat(3)}@${host.slice(0, 1)}${DOT.repeat(3)}${tld.length ? "." + tld.join(".") : ""}`;
}

export function maskPhone(value?: string): string | undefined {
  if (!value) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return DOT.repeat(4);
  return `${DOT.repeat(4)} ${DOT.repeat(2)} ${digits.slice(-4)}`;
}

export function maskText(value?: string): string | undefined {
  if (!value) return value;
  if (value.length <= 3) return DOT.repeat(4);
  return `${value.slice(0, 2)}${DOT.repeat(4)}`;
}

/** Mask contact-type fields. Unmasked values require an audited reveal request. */
export function maskAccess(access: AccessDetails): AccessDetails {
  return {
    ...access,
    usernameHint: maskText(access.usernameHint),
    registeredEmail: maskEmail(access.registeredEmail),
    registeredPhone: maskPhone(access.registeredPhone),
    otpDestination: access.otpDestination ? maskOtp(access.otpDestination) : undefined,
    contacts: access.contacts.map((c) => ({ ...c, phone: maskPhone(c.phone), email: maskEmail(c.email) })),
  };
}

function maskOtp(value: string): string {
  if (value.includes("@")) return maskEmail(value) ?? "";
  if (/\d{4}/.test(value)) return value.replace(/\d(?=(?:\D*\d){4})/g, DOT);
  return value;
}

export function hasRevealableAccess(access: AccessDetails): boolean {
  return Boolean(
    access.usernameHint ||
    access.registeredEmail ||
    access.registeredPhone ||
    access.otpDestination ||
    access.contacts.some((c) => c.phone || c.email),
  );
}

/** The ledger as sent to browsers: identical except contact details are masked. */
export function toLedgerView(state: LedgerState): LedgerState {
  return {
    ...state,
    members: state.members.map(({ authUserId: _authUserId, ...m }) => m),
    accounts: state.accounts.map((a: Account) => ({ ...a, access: maskAccess(a.access) })),
  };
}

/**
 * Audit entries record before/after values. For sign-in/contact details those
 * must be masked too, or the activity log would bypass the reveal gate.
 */
export function maskAuditEntry<T extends { changes: Array<{ field: string; before?: unknown; after?: unknown }> }>(
  entry: T,
): T {
  if (!entry.changes.some((c) => c.field === "access")) return entry;
  const maskValue = (v: unknown) =>
    v && typeof v === "object"
      ? maskAccess({ ...(v as AccessDetails), contacts: (v as AccessDetails).contacts ?? [] })
      : v;
  return {
    ...entry,
    changes: entry.changes.map((c) =>
      c.field === "access" ? { ...c, before: maskValue(c.before), after: maskValue(c.after) } : c,
    ),
  };
}
