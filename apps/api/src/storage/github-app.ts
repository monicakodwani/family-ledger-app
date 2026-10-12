import { SignJWT, importPKCS8 } from "jose";
import { StoreUnavailableError } from "./types";

/**
 * Mints short-lived GitHub App installation tokens restricted to ONE
 * repository with contents:write only. The App private key lives in a
 * Worker secret; tokens are cached in memory until shortly before expiry and
 * never logged or returned to clients.
 */
export class GitHubAppTokenProvider {
  private cached: { token: string; expiresAt: number } | null = null;
  private keyPromise: Promise<CryptoKey> | null = null;

  constructor(
    private opts: {
      appId: string;
      installationId: string;
      privateKeyPkcs8: string;
      repo: string;
      fetch?: typeof fetch;
      now?: () => number;
    },
  ) {}

  private now() {
    return this.opts.now?.() ?? Date.now();
  }

  async getToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - 5 * 60_000 > this.now()) return this.cached.token;
    this.keyPromise ??= importPKCS8(this.opts.privateKeyPkcs8, "RS256");
    const key = await this.keyPromise;
    const nowSec = Math.floor(this.now() / 1000);
    const appJwt = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(nowSec - 60)
      .setExpirationTime(nowSec + 9 * 60)
      .setIssuer(this.opts.appId)
      .sign(key);
    const res = await (this.opts.fetch ?? fetch)(
      `https://api.github.com/app/installations/${encodeURIComponent(this.opts.installationId)}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${appJwt}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "family-ledger-api",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ repositories: [this.opts.repo], permissions: { contents: "write" } }),
      },
    );
    if (!res.ok) throw new StoreUnavailableError(`Could not obtain GitHub installation token (${res.status})`);
    const json = (await res.json()) as { token: string; expires_at: string };
    this.cached = { token: json.token, expiresAt: Date.parse(json.expires_at) };
    return json.token;
  }
}
