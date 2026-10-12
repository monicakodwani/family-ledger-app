# Roadmap

V1 prioritises clarity, everyday usability, reliability and security. Later phases build on the boundaries already in place (`LedgerStore`, `SyncProvider`, `parentId`, `currency`, schema migrations).

## V1 (this prototype)

- Home, Our Money, Accounts & Access, Family Plans, Notes, Things to check, Documents index, Activity, Security & Settings
- Manual valuations with sources and verification status; conflicts preserved
- Passkey sign-in (Supabase beta) with email-link fallback; session registry; emergency pause with two approvals
- Encrypted GitHub storage with atomic commits, hash-chained audit, snapshots, offline verify/re-key tool
- PWA install, offline notice, no sensitive caching
- Demo mode on GitHub Pages

## Before relying on it daily (V1.1)

- [ ] Real-device testing on each family member's iPhone (see `docs/IPHONE_TEST_CHECKLIST.md`)
- [ ] Confirm Supabase passkey tokens carry `amr` timestamps in production (the API fails closed if not)
- [ ] Hindi translation of the interface (`apps/web/src/i18n/hi.ts`)
- [ ] Email or push notification to other members on new-device sign-in and emergency requests
- [ ] Scheduled automatic snapshot (e.g. monthly) via a Cron Trigger
- [ ] Independent security review

## V2 — History and reminders

- Historical net worth chart from dated valuations (charts appear only when real history exists)
- Maturity and renewal reminders (Cron Trigger → email)
- Interest and dividend tracking
- Encrypted document storage: client-uploaded files encrypted server-side into object storage (e.g. R2) with per-file keys — **not** into Git history
- Move storage to PostgreSQL (implement `LedgerStore`; append-only audit table)

## V3 — Granular holdings and data import

- Holdings inside accounts (`parentId`), consolidated mutual fund view, overlap analysis
- Import Consolidated Account Statements (CAS) from CAMS/KFintech as `statement_import` sync results
- Market price updates as clearly labelled estimates (`price_estimate`)
- Authorised Account Aggregator integration (RBI AA framework) — consent-based, never scraping or stored bank passwords

## V4 — Planning

- Family goals with targets and progress
- Retirement income planning, scenario modelling
- Property purchase planning
- Tax planning notes per financial year
- Estate documentation (nominees, wills, where documents are)
- Multi-currency accounts with dated exchange rates
- Inviting more family members
