# Deployment guide

This guide takes Family Ledger from this repository to a working private app on three phones. It uses only free tiers, but please read the cost and limitation notes at the end.

You'll need accounts on **GitHub**, **Cloudflare** and **Supabase**, plus Node.js 22+ on your computer.

> Steps marked 🔐 involve secrets. Do them on your own computer, never paste secrets into issues, chats or commits, and delete any downloaded key files once they're stored.

## 0. Overview

| Piece    | Where                                      | Public?                                                          |
| -------- | ------------------------------------------ | ---------------------------------------------------------------- |
| Frontend | GitHub Pages from `family-ledger-app`      | Yes (code only, no data)                                         |
| API      | Cloudflare Worker `family-ledger-api`      | Reachable, but every data route requires a family member's token |
| Sign-in  | Supabase Auth project (used only for auth) | —                                                                |
| Data     | Private repo `family-ledger-private-data`  | **Private**                                                      |

You can publish the **demo** first (no accounts other than GitHub needed), then switch to **connected** mode.

---

## 1. Application repository and GitHub Pages (demo first)

1. Create a GitHub repository named `family-ledger-app` and push this code to it.
   GitHub Pages on a free plan requires this repository to be public. That's fine: it contains no data or secrets.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main`. The `Deploy to GitHub Pages` workflow lints, type-checks, tests, builds, runs the artefact guard and publishes. With no variables set, it publishes the **demo** build at `https://<you>.github.io/family-ledger-app/`.

**Base path and routing.** The workflow sets `VITE_BASE_PATH=/<repo-name>/` automatically. The build copies `index.html` to `404.html`, so refreshing a deep link (e.g. `/family-ledger-app/accounts/acc_fd`) still loads the app. With a custom domain, set the repository variable `BASE_PATH` to `/`.

---

## 2. Private data repository

1. Create a **private** repository `family-ledger-private-data`.
2. Tick **"Add a README file"** when creating it. The API cannot write to an empty repository.
3. Do not enable Pages, do not add collaborators, and do not add files by hand. The API will create `FORMAT.md`, `ledger/`, `audit/` and `snapshots/` on first use.

## 3. GitHub App (the API's narrowly scoped credential) 🔐

1. GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**.
   - Name: `family-ledger-<you>`; Homepage URL: your Pages URL.
   - **Webhook:** untick "Active".
   - **Repository permissions:** _Contents: Read and write_. (Metadata: Read-only is added automatically.) Nothing else.
   - **Where can this app be installed:** Only on this account.
2. Create the app. Note the **App ID**.
3. **Generate a private key** and download the `.pem`.
4. **Install App → Only select repositories → `family-ledger-private-data`.** After installing, the URL looks like `github.com/settings/installations/12345678`: that number is the **Installation ID**.
5. Convert the key to PKCS#8 (required by the Worker's WebCrypto):

   ```bash
   openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in family-ledger.private-key.pem -out app-pkcs8.pem
   ```

   You'll upload `app-pkcs8.pem` in step 5, then delete both files.

The API asks GitHub for installation tokens restricted to that one repository with `contents:write`; tokens last one hour and are never sent to browsers.

## 4. Supabase Auth

1. Create a Supabase project used **only** for Family Ledger sign-in (no tables needed). Choose a region near India (e.g. Mumbai `ap-south-1`).
2. **Authentication → Sign In / Providers**
   - Email: enabled. **Turn off "Allow new users to sign up"** (family members are invited).
   - Turn off every provider you don't need.
3. **Authentication → Passkeys** (beta): enable passkey authentication.
   - Relying Party ID: the bare host of your site, e.g. `<you>.github.io` (or `ledger.yourdomain.in` with a custom domain). Passkeys are bound to this; changing it later means re-registering passkeys.
   - Relying Party Origins: `https://<you>.github.io`.
   - Display name: `Family Ledger`.
4. **Authentication → URL Configuration**
   - Site URL: `https://<you>.github.io/family-ledger-app/`
   - Redirect URLs: the same URL (and `http://localhost:5173/` for local development if you want).
5. **Project Settings → JWT Keys:** make sure the project signs tokens with **asymmetric JWT signing keys** (ES256/RS256). The API refuses the legacy shared-secret (HS256) tokens. If your project still uses the legacy secret, migrate and rotate to the new signing key.
6. Note the **Project URL** (`https://<ref>.supabase.co`) and the **publishable (anon) key**. The publishable key is designed to be public and goes into the frontend build.
7. 🔐 Optional but recommended: the **service role key** lets the API ban a paused member and sign people out globally at Supabase as well. It is powerful; keep it only as a Worker secret.
8. Optional: customise the email templates (Authentication → Emails) with friendly wording, e.g. "Tap to open Family Ledger".

## 5. Cloudflare Worker (API) 🔐

```bash
cd apps/api
npx wrangler login
```

Edit `apps/api/wrangler.jsonc` → `vars`:

| Variable                                                                | Value                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ALLOWED_ORIGINS`                                                       | `https://<you>.github.io` (origin only, no path; comma-separate several) |
| `SUPABASE_URL`                                                          | `https://<ref>.supabase.co`                                              |
| `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_BRANCH`                        | `<you>` / `family-ledger-private-data` / `main`                          |
| `GITHUB_APP_ID` / `GITHUB_APP_INSTALLATION_ID`                          | from step 3                                                              |
| `DATA_ACTIVE_KEY_ID`                                                    | `k1`                                                                     |
| `IDLE_TIMEOUT_MINUTES` / `SESSION_MAX_AGE_HOURS` / `FRESH_AUTH_MINUTES` | defaults 60 / 12 / 5                                                     |

Set secrets (each command prompts; paste the value):

```bash
npx wrangler secret put FAMILY_MEMBERS
```

Value (one line, use the emails each person reads on their phone):
`[{"id":"m_mumma","displayName":"Neeta","email":"..."},{"id":"m_papa","displayName":"Chandra","email":"..."},{"id":"m_me","displayName":"Monica","email":"..."}]`

```bash
npm run backup-tool -w @family-ledger/api -- genkey
```

Copy the printed key, then:

```bash
npx wrangler secret put DATA_ENCRYPTION_KEYS
```

Value: `{"k1":"<the key you just generated>"}` — and **save the same value in your family password manager now**. Without it, the data can never be decrypted.

```bash
npx wrangler secret put GITHUB_APP_PRIVATE_KEY < app-pkcs8.pem
```

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Deploy:

```bash
npx wrangler deploy
```

Note the URL, e.g. `https://family-ledger-api.<subdomain>.workers.dev`. Check `GET /api/health` returns `{"ok":true}` and `GET /api/ledger` returns 401. Then delete `family-ledger.private-key.pem` and `app-pkcs8.pem`.

**Custom API domain (optional):** Workers → your worker → Settings → Domains & Routes → add `api.yourdomain.in`. Update `VITE_API_BASE_URL` accordingly.

## 6. Switch the frontend to connected mode

In `family-ledger-app` → **Settings → Secrets and variables → Actions → Variables** (these are public values, not secrets):

| Variable                   | Value                                               |
| -------------------------- | --------------------------------------------------- |
| `APP_MODE`                 | `connected`                                         |
| `API_BASE_URL`             | `https://family-ledger-api.<subdomain>.workers.dev` |
| `SUPABASE_URL`             | `https://<ref>.supabase.co`                         |
| `SUPABASE_PUBLISHABLE_KEY` | the publishable/anon key                            |
| `BASE_PATH`                | optional; `/` with a custom domain                  |

Re-run the Pages workflow. The build fails on purpose if any value is missing or the API URL isn't https. The demo code is not included in a connected build.

**HTTPS** is mandatory everywhere: Pages and workers.dev provide it automatically; passkeys don't work without it.

**CORS:** the API accepts browser requests only from `ALLOWED_ORIGINS`. If sign-in works but data doesn't load, check the origin matches exactly (scheme + host, no trailing slash or path).

## 7. Custom domain (optional, recommended)

1. Pages: Settings → Pages → Custom domain → `ledger.yourdomain.in`; add the CNAME record your DNS provider needs; tick **Enforce HTTPS**.
2. Set `BASE_PATH=/`, update Supabase Site URL/redirects and passkey RP ID/origins, and update the Worker's `ALLOWED_ORIGINS`. Redeploy both.
3. Putting the domain behind Cloudflare also lets you add real HTTP security headers (e.g. `frame-ancestors`) that GitHub Pages can't send.

## 8. Invite each family member

For each person:

1. Make sure their email is in `FAMILY_MEMBERS` (step 5) and the Worker has been redeployed.
2. Supabase → **Authentication → Users → Invite user** → their email.
3. On **their iPhone**, open the invitation email **in Safari** and tap the link. Family Ledger opens signed in.
4. The app offers **"Set up Face ID sign-in"**. Tap it and approve with Face ID. This creates a passkey in their iCloud Keychain.
5. Still in Safari: **Share → Add to Home Screen → Add**. From now on: tap the icon → Face ID → home screen.
6. If passkeys aren't available on a device, they can use **"Email me a sign-in link"** instead.

Help them do it once in person. Check that **Settings → Passwords** on the iPhone shows a passkey for your domain.

## 9. Lost or stolen phone

Follow `docs/EMERGENCY.md`. In short:

- **Your own phone:** from another device, sign in → More → Security → _Sign out everywhere_.
- **Someone else's phone:** More → Security → _A family member's phone was lost_ → request a pause. A **second** family member approves on their phone. The account is paused and every session is signed out immediately. When they have a new phone, two members approve _Unpause_, and they sign in again.
- **Then** handle the external systems (Apple ID, email, banks, password manager) — Family Ledger can't do that for you.

## 10. Backups and restore

Three layers:

1. **In-app snapshots:** More → Security → Backups → _Save a backup now_ (also taken automatically before any restore). _Restore_ brings back a snapshot; the current version is saved first, so restoring is reversible.
2. **Encrypted off-site copy:** any clone of the private repo is a complete encrypted backup.

   ```bash
   git clone git@github.com:<you>/family-ledger-private-data.git
   ```

   Prove it can be decrypted (prints counts only, never amounts):

   ```bash
   DATA_ENCRYPTION_KEYS='{"k1":"..."}' DATA_ACTIVE_KEY_ID=k1 npm run backup-tool -w @family-ledger/api -- verify ../family-ledger-private-data
   ```

   Do this monthly and keep a copy on an encrypted drive. To keep the key out of shell history, load it from your password manager's command-line tool rather than typing it.

3. **Plain export:** More → Security → _Download a copy_ (fresh Face ID required) gives a readable JSON file. It is **not encrypted**; store it carefully and delete it when no longer needed.

**Restoring after a disaster** (e.g. the private repo was deleted): create a new private repo, push your verified clone to it (`git push --mirror`), install the GitHub App on it, update `GITHUB_REPO` and redeploy. If the Cloudflare account is lost, redeploy the Worker anywhere with the same `DATA_ENCRYPTION_KEYS` from your password manager.

## 11. Rotating credentials

| Credential                                      | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Data encryption key**                         | 1) `genkey` → new key `k2`. 2) `wrangler secret put DATA_ENCRYPTION_KEYS` with `{"k1":"old","k2":"new"}` and set `DATA_ACTIVE_KEY_ID=k2`; deploy. New writes use `k2`. 3) Re-encrypt existing files: clone the repo, run `backup-tool rekey` with both keys, `backup-tool verify` with only `k2`, commit and push. 4) Remove `k1` from the Worker. **Keep `k1` in the password manager**: older git history is still encrypted with it. If `k1` was _compromised_, history encrypted with it must be considered exposed (see SECURITY.md). |
| **GitHub App key**                              | App settings → Generate a new private key → convert → `wrangler secret put GITHUB_APP_PRIVATE_KEY` → deploy → delete the old key in GitHub.                                                                                                                                                                                                                                                                                                                                                                                                |
| **Supabase service role key / JWT signing key** | Rotate in Supabase (JWT Keys: create standby key → rotate). The Worker re-fetches JWKS automatically; update `SUPABASE_SERVICE_ROLE_KEY` secret if rotated.                                                                                                                                                                                                                                                                                                                                                                                |
| **Cloudflare / GitHub / Supabase accounts**     | Protect each with a passkey or hardware key. These accounts can reach all data.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 12. Local development

```bash
npm install
```

Fictional demo, no accounts needed:

```bash
npm run dev:demo -w @family-ledger/web
```

API locally with the in-memory store (copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and fill in a generated key):

```bash
npm run dev -w @family-ledger/api -- --env dev
```

All checks:

```bash
npm run check
```

## Costs and limits (as of October 2026 — verify current pricing)

- **GitHub:** free for public app repo, private data repo and Pages.
- **Cloudflare Workers Free:** 100,000 requests/day; SQLite-backed Durable Objects are available on the free plan.
- **Supabase Free:** sufficient user limits, **but free projects are paused after about a week of inactivity**. If the family may go a week without opening the app, either upgrade the project or sign in weekly; a paused project means nobody can sign in until it is resumed from the dashboard.
- No paid resources are created by this repository.
