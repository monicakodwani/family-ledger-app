# Family Ledger

A private, mobile-first app where a family can see — in one calm place — what money exists, where it is, whose name it's in, how sure we are about each number, and what we're planning to do with it.

Built for three equal members (Chandra, Neeta and Monica), designed first for Mumma's iPhone: Face ID to open, big friendly buttons, no spreadsheets.

> **Status: working prototype.** The demo is complete and safe to share. Connected mode is implemented and tested against simulated GitHub, Supabase and Durable Object environments; it has **not yet** been run against real cloud accounts or tested on a physical iPhone. See [What's real, mocked, or not yet safe](#whats-real-mocked-or-not-yet-safe).

## What it does

- **Home** — estimated family net worth (clearly marked _partial_ while amounts are missing), things to check, upcoming maturities, recent family activity, current plans.
- **Our Money** — totals, breakdowns by type, institution, manager, liquidity, verification and owner; personal ownership views that never assume a split; every chart has a text alternative.
- **Accounts & Access** — a directory of every account with ownership, valuations, verification status, masked registered contact details, official links and password-manager links (no passwords are ever stored).
- **Family Plans** — proposals, discussion, explicit decisions with individual agreement, steps, budgets.
- **Notes** — general and per-account notes and questions, with edit history, replies, pinning and "mark as answered".
- **Things to check** — a shared checklist, partly generated from the data itself ("Nokia PF amount not yet entered").
- **Activity** — a searchable, hash-chained audit trail of who changed what, with before/after values.
- **Security** — your devices, sign out everywhere, a two-person emergency pause for a lost phone, backups, export.

## Quick start (fictional demo, no accounts needed)

```bash
npm install
```

```bash
npm run dev:demo -w @family-ledger/web
```

Open the printed URL, pick a family member, and explore. Changes live in memory only and vanish on reload.

Run every check (format, lint, types, unit/API tests):

```bash
npm run check
```

End-to-end tests (builds the demo, runs iPhone-sized WebKit and desktop Chromium):

```bash
npm run test:e2e
```

## Repository layout

```
apps/web/         React + Vite + Tailwind PWA (GitHub Pages)
apps/api/         Cloudflare Worker API, session registry (Durable Object), GitHub storage
packages/shared/  Domain model: schemas, money, commands, calculations, audit
scripts/          CI helpers (Pages artefact guard)
docs/             Emergency procedures, iPhone test checklist
```

## Documentation

| Document                                                       | What's in it                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                             | Components, request flow, concurrency, GitHub-as-storage assessment, Postgres migration path       |
| [SECURITY.md](SECURITY.md)                                     | Threat model, what is enforced and tested, revocation latency, **known limitations**               |
| [DATA_MODEL.md](DATA_MODEL.md)                                 | Entities, money representation, verification rules, calculations, private repo layout              |
| [DEPLOYMENT.md](DEPLOYMENT.md)                                 | Step-by-step setup of Pages, GitHub App, Supabase passkeys, Worker, invites, backups, key rotation |
| [ROADMAP.md](ROADMAP.md)                                       | What comes next                                                                                    |
| [docs/EMERGENCY.md](docs/EMERGENCY.md)                         | Printable lost-phone procedure, including banks, email, Apple ID                                   |
| [docs/IPHONE_TEST_CHECKLIST.md](docs/IPHONE_TEST_CHECKLIST.md) | Manual checks for real iPhones                                                                     |

## Key decisions

| Decision                                                                      | Why                                                                                                                              |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase Auth with passkeys** (beta) + email-link fallback                  | Face ID sign-in on iPhone without a password; managed provider, no homegrown auth. Passkeys are beta, so the email link remains. |
| **Server-side session registry** in a Durable Object                          | JWTs stay valid until expiry; the registry makes revocation, inactivity timeout and emergency pause immediate.                   |
| **Membership in server config**                                               | No one can add a member through the app, even with a stolen session.                                                             |
| **Private GitHub repo as encrypted storage** behind a `LedgerStore` interface | Your preference; acceptable at family scale with atomic commits and optimistic concurrency. Swappable for Postgres.              |
| **AES-256-GCM with path-bound AAD and key ids** via WebCrypto                 | Standard primitives only; supports rotation.                                                                                     |
| **One command pipeline** shared by demo and server                            | The demo behaves exactly like production, and every change is validated and audited the same way.                                |
| **Integer paise with BigInt**                                                 | No floating-point errors; exact lakh/crore formatting.                                                                           |
| **Document uploads disabled**                                                 | Files must never enter Git history unencrypted; an index of where papers are kept is provided instead.                           |

## What's real, mocked, or not yet safe

| Area                                                                                     | Status                                                                                             |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Demo mode (fictional data, in-memory)                                                    | ✅ Complete                                                                                        |
| Domain logic, calculations, validation, audit chain                                      | ✅ Implemented and unit-tested                                                                     |
| API: auth enforcement, sessions, revocation, emergency pause, rate limits, CORS, headers | ✅ Implemented and tested with locally signed JWTs; ⚠️ not yet run against a live Supabase project |
| GitHub storage adapter with encryption                                                   | ✅ Implemented and tested against a fake Git Data API; ⚠️ not yet run against real GitHub          |
| Durable Object wrapper                                                                   | ✅ Boots under `wrangler dev`; engine logic is tested in memory                                    |
| Supabase passkeys                                                                        | ⚠️ Supabase beta, experimental client API; the app degrades to email links if unavailable          |
| New-device verification                                                                  | ⚠️ Notification-based (visible in activity/devices), not approval-based                            |
| Sync providers                                                                           | 🧪 Interface + mock only. No real bank/broker connections, no scraping                             |
| Document uploads                                                                         | ⛔ Disabled by design until encrypted object storage exists                                        |
| Hindi                                                                                    | 🧪 i18n structure in place; translations not written                                               |
| Real iPhone Safari / Face ID / Add to Home Screen                                        | ⚠️ Not tested on a device; use the manual checklist                                                |

**Do not enter real family financial data until** connected mode has been deployed, each member has signed in on their own phone, and the iPhone checklist and a backup verify have passed.
