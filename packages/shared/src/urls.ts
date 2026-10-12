/**
 * Outbound link validation. The app only ever opens links that the family
 * typed into an account record, and only if they are plain https URLs to a
 * public hostname. There is no redirect endpoint: links open directly with
 * rel="noopener noreferrer".
 */

const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "127.0.0.1", "[::1]"]);

export function isSafeExternalUrl(raw: string): boolean {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 500) return false;
  if (/[\s<>"'`\\]/.test(raw)) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return false;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (!host.includes(".")) return false;
  // Reject bare IP addresses: official institutions use domain names.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return false;
  // Reject punycode lookalikes (e.g. xn--sb-...) to reduce homograph phishing risk.
  if (host.split(".").some((label) => label.startsWith("xn--"))) return false;
  return true;
}

/** Returns a normalised URL string safe to put in an href, or null. */
export function safeHref(raw: string | undefined | null): string | null {
  if (!raw || !isSafeExternalUrl(raw)) return null;
  return new URL(raw).toString();
}

export function displayHost(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}

/**
 * Official web vault home pages. We do not assume arbitrary deep links are
 * supported by a password manager; item URLs are only used if the family
 * pasted one and it points at the provider's own domain.
 */
export const PASSWORD_MANAGER_HOMES = {
  bitwarden: { name: "Bitwarden", url: "https://vault.bitwarden.com/", domains: ["bitwarden.com", "bitwarden.eu"] },
  "1password": {
    name: "1Password",
    url: "https://my.1password.com/",
    domains: ["1password.com", "1password.eu", "1password.ca"],
  },
} as const;

export function passwordManagerHref(
  provider: "none" | "bitwarden" | "1password" | "other",
  itemUrl?: string,
): string | null {
  if (provider === "none") return null;
  const safeItem = safeHref(itemUrl);
  if (provider === "other") return safeItem;
  const home = PASSWORD_MANAGER_HOMES[provider];
  if (safeItem) {
    const host = new URL(safeItem).hostname;
    if (home.domains.some((d) => host === d || host.endsWith(`.${d}`))) return safeItem;
  }
  return home.url;
}
