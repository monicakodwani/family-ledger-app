# Security and threat model

Family Ledger holds a family's confidential financial picture. This document states what is protected, how, what is **enforced and tested**, and what is **not** protected. If you find a security problem, contact the repository owner privately; please do not open a public issue.

## What we protect

| Asset                                               | Where it lives                                             | Protection                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Ledger (accounts, amounts, ownership, notes, plans) | `family-ledger-private-data`, file `ledger/state.json.enc` | AES-256-GCM, server-held key, private repo, API-only access                                                          |
| Audit log                                           | `audit/*.json.enc`                                         | Encrypted + SHA-256 hash chain                                                                                       |
| Registered emails/phones/usernames for institutions | Inside the ledger                                          | Encrypted at rest; **masked** in every API response; unmasked only via an audited, fresh-auth "Show details" request |
| Session registry, sign-in events                    | Cloudflare Durable Object storage                          | Cloudflare-managed; contains member ids, device labels, timestamps — no financial data                               |
| Encryption keys, GitHub App key                     | Cloudflare Worker secrets                                  | Never in git, never in the frontend, never logged                                                                    |
| Bank / broker passwords and OTPs                    | **Not stored anywhere in Family Ledger**                   | Kept in Bitwarden/1Password; the app stores only a provider name, a non-secret item reference and instructions       |

## Trust boundaries

1. **Browser ↔ GitHub Pages** — public static files. Contain no data and no secrets. Anyone can download the app; that alone grants nothing.
2. **Browser ↔ API** — HTTPS, `Authorization: Bearer <Supabase JWT>`, strict CORS allowlist, JSON-only bodies ≤ 64 KB.
3. **API ↔ Supabase** — JWKS fetch for signature verification; optional Admin API calls for provider-side bans.
4. **API ↔ GitHub** — short-lived GitHub App installation token restricted to one repository with `contents:write`.
5. **People** — three equal members. Any member may edit ordinary records without approval. Identity-level actions against another member need a second member.

## Threats and mitigations

| #   | Threat                                                | Mitigation                                                                                                                                                                                                                                   | Enforced & tested?                                                  |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| T1  | Someone finds the public site                         | No data in Pages artefact; all data requires a valid member JWT. Hidden URLs are not used as access control.                                                                                                                                 | ✅ `auth.test.ts` (every route 401 without auth); CI artefact guard |
| T2  | Forged / expired / foreign tokens                     | JWKS signature check, issuer, audience, expiry, asymmetric algs only (HS256 refused), anonymous users refused, `amr` required                                                                                                                | ✅ `auth.test.ts`                                                   |
| T3  | A valid Supabase user who is not family               | Membership from server config; email-match binding; second identity with a member's email refused                                                                                                                                            | ✅ `auth.test.ts`                                                   |
| T4  | Lost / stolen phone (signed in)                       | Owner: "Sign out this device" or "Sign out everywhere" (fresh auth). Others: emergency pause needing **two** non-target members; target cannot approve or cancel. Pause revokes all sessions and blocks new sign-ins; optional Supabase ban. | ✅ `sessions.test.ts`                                               |
| T5  | Revoked device refreshes its token                    | Session registry keyed by `session_id`; revoked ids stay refused regardless of token freshness. Revoke-all also refuses any token whose sign-in time predates the revocation.                                                                | ✅ `sessions.test.ts`                                               |
| T6  | Unattended unlocked phone                             | Server-enforced inactivity timeout (default 60 min) and max session age (12 h); client also clears its cache when idle; sensitive actions need Face ID within 5 min                                                                          | ✅ `sessions.test.ts`, `ledger.test.ts` (reveal)                    |
| T7  | Cross-site request forgery                            | No cookies; bearer tokens only; JSON content type required; CORS allowlist rejects unknown origins outright                                                                                                                                  | ✅ `auth.test.ts`                                                   |
| T8  | XSS in the web app                                    | React escaping; `dangerouslySetInnerHTML` banned by lint; strict CSP meta (`script-src 'self'`, no inline script); outbound links validated (https, no credentials, no IPs/punycode/localhost)                                               | ✅ URL tests; lint rule. CSP is a `<meta>` (see limitations)        |
| T9  | Financial data cached on the device                   | API sends `Cache-Control: no-store`; service worker caches only same-origin static assets and never `/api`, cross-origin or `Authorization` requests; no ledger data in localStorage/IndexedDB; query cache in memory only                   | ✅ API header tests; web `sw` and storage tests                     |
| T10 | Lost edits / silent overwrite                         | Entity versions + atomic, non-fast-forward commits + retry                                                                                                                                                                                   | ✅ `ledger.test.ts`, `storage.test.ts`                              |
| T11 | Audit history rewritten                               | No API to edit/delete audit entries; hash chain detects edits outside the app (`chainVerified: false`)                                                                                                                                       | ✅ `audit-urls.test.ts`, `ledger.test.ts`                           |
| T12 | Private repo exposed (leak, mis-share, GitHub breach) | Contents are AES-256-GCM ciphertext; AAD binds each file to its path; key not in GitHub                                                                                                                                                      | ✅ `storage.test.ts` (no plaintext in any blob)                     |
| T13 | Token / secret leakage via logs                       | Logger accepts an allowlisted set of fields only (request id, route, status, error code)                                                                                                                                                     | Code review; no test                                                |
| T14 | Brute force / abuse                                   | Rate limits: failed auth per IP (30/5 min), requests per member (300/min), writes (60/min), reveals (30/10 min), exports, snapshots, emergency requests                                                                                      | ✅ `auth.test.ts`, `ledger.test.ts`                                 |
| T15 | Misconfiguration                                      | Worker fails closed on invalid config (http origins, wildcard, bad members, memory storage outside development)                                                                                                                              | ✅ `config.test.ts`                                                 |
| T16 | Demo mode reaching production                         | Demo client absent from connected bundle; demo build refuses an API URL; API has no bypass                                                                                                                                                   | Web build guard tests; API has no such code path                    |

## Revocation latency

| Action                       | Family Ledger API                               | Supabase itself                                                                                                      |
| ---------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Sign out a device            | **Immediate** (next request refused)            | The Supabase session may still refresh until it expires unless signed out globally                                   |
| Sign out everywhere          | **Immediate**                                   | Global sign-out called when `SUPABASE_SERVICE_ROLE_KEY` is configured                                                |
| Emergency pause              | **Immediate** for all existing and new sessions | User banned when the service role key is configured                                                                  |
| Without the service role key | Still immediate for this API                    | Access tokens remain valid at Supabase for up to their lifetime (default 1 h), but they are useless against this API |

## Known limitations and residual risks (read this)

1. **Git history is permanent.** Deleting or archiving a record does not remove earlier ciphertext from the private repository's history. If an encryption key is ever compromised, _every_ historical file encrypted with it can be read. Rotating keys protects future writes only. Truly erasing history requires rewriting the repository (and every clone) — not supported by the app.
2. **Encryption does not protect against a compromised server.** Anyone with Cloudflare account access can read Worker secrets and therefore decrypt everything. Protect the Cloudflare account with a passkey/hardware key and limit who has access.
3. **The audit chain is tamper-evident, not tamper-proof.** Someone with both repo write access and the encryption key could rewrite the whole chain consistently. A Postgres audit table with no UPDATE/DELETE rights, or periodic off-site signed checkpoints, would be stronger.
4. **Sign-in events** (new devices) live in the Durable Object, not in the hash-chained GitHub log, and are capped at the latest 1,000. Revocations, pauses, reveals, exports and restores _are_ in the GitHub audit log.
5. **Supabase passkeys are in beta** (announced May 2026; experimental client API). The email-link fallback is only as strong as each person's email account — protect those email accounts with passkeys/2FA.
6. **New-device handling is notification-based.** New sign-ins appear in the activity log and devices list; they are not held for approval. A thief with an unlocked phone _and_ access to the email app could sign in again — that is exactly what the emergency pause is for.
7. **GitHub Pages cannot send HTTP headers.** CSP is delivered via `<meta>`, which cannot set `frame-ancestors`; clickjacking protection on the static site is therefore limited (the API itself sends `frame-ancestors 'none'`). Use a custom domain behind Cloudflare to add real headers.
8. **Tokens in `sessionStorage`.** Supabase session tokens are kept in `sessionStorage` (cleared when the app/tab is closed) so reopening the app asks for Face ID. An XSS bug could steal a token; CSP and React escaping reduce but do not eliminate that risk; server-side revocation limits the damage.
9. **Membership is configuration.** Adding or removing a member requires updating `FAMILY_MEMBERS` and redeploying the Worker. This is deliberate (no in-app privilege escalation) but must be done by whoever administers Cloudflare.
10. **External systems are separate.** Revoking Family Ledger access does **not** revoke bank, broker, email, Apple ID or password-manager access. See `docs/EMERGENCY.md`.
11. **Document uploads are disabled.** Only a document index (title, where it's kept) is stored. Uploading statements into GitHub history is unsafe and was deliberately not built.
12. **No independent security audit** has been performed. Treat this as a well-tested prototype.

## Operational rules

- Never commit real secrets, statements, or real family values to `family-ledger-app`. `.gitignore` excludes `.dev.vars`, `.env*`, `*.pem`, `*.key`, `private-data/`.
- Keep `family-ledger-private-data` private, with no collaborators beyond the administrator and GitHub Pages disabled. If you protect `main`, allow the Family Ledger GitHub App to push to it, and block force-pushes for everyone else.
- Store `DATA_ENCRYPTION_KEYS` in two places: the Worker secret and the family's password manager (shared vault). Losing every copy of the key means the data is unrecoverable.
