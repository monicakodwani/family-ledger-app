# Data model

Source of truth: `packages/shared/src/schema.ts` (Zod). Current `SCHEMA_VERSION = 1`.

## Principles

- **Facts vs claims.** Every amount is a `Valuation` with a source, a date, a confidence and who entered it. The account's displayed status is _derived_, never typed in.
- **Unknown is not zero.** Missing values are excluded from totals and totals are labelled partial.
- **Nothing is hard-deleted.** Records are archived (`archivedAt`); wrong amounts are "set aside" with a note; edits keep earlier wording.
- **Independent dimensions.** Asset class, ownership, liquidity, manager, institution, tax treatment and restrictions are separate fields.
- **Money is exact.** Amounts are integer paise stored as decimal strings (`"250000000"` = ₹25,00,000) and computed with `BigInt`. No floating point anywhere in balances.

## Entities

### LedgerState (one encrypted file)

| Field                                               | Notes                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `schemaVersion`                                     | Literal `1`                                                      |
| `revision`                                          | Increments on every change                                       |
| `baseCurrency`                                      | `"INR"`                                                          |
| `members`                                           | Family members who can sign in (mirrors server `FAMILY_MEMBERS`) |
| `people`                                            | Family members _and_ external people (e.g. portfolio managers)   |
| `accounts`, `plans`, `notes`, `checks`, `documents` | See below                                                        |

### Account

| Group       | Fields                                                                                                                                                                                                                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity    | `id`, `version`, `displayName`, `nickname`, `institution` ("Where is this money?"), `assetClass`, `productTypeNote`, `description`, `lifecycle` (active/closed/unknown)                                                                                                                                          |
| Structure   | `parentId`, `includedInParentValue` — a holding inside a portfolio. If `true` and the parent is active, the child is skipped in totals (no double counting).                                                                                                                                                     |
| Ownership   | `ownership.status` (confirmed/unconfirmed/disputed/unknown), `ownership.owners[]` (`personId`, optional `sharePercent`), `ownership.associatedPersonIds` (who it's _associated with_ when legal ownership isn't confirmed), `ownership.note`, `nominees`, `managedByPersonId`, `managerNote`, `authorisedAccess` |
| Money       | `currency`, `valuations[]`, `awaitingStatement`, `conflict`, `originalInvestmentMinor`, `contributionsNote`                                                                                                                                                                                                      |
| Liabilities | `assetClass: "liability"`; outstanding amount = its valuations; `creditLimitMinor` = approved facility (**never** subtracted); `linkedAccountIds` (e.g. FD ↔ overdraft)                                                                                                                                          |
| Terms       | `liquidity`, `restrictions`, `maturityDate`, `maturityDateConfirmed`, `interestDetails`, `taxTreatment`, `taxNotes`                                                                                                                                                                                              |
| Access      | `access.officialWebsite`, `access.loginUrl` (validated https), `usernameHint`, `registeredEmail`, `registeredPhone`, `otpDestination`, `authenticator`, `passwordManager` (provider, non-secret item reference, optional provider-domain item URL, instructions), `statementInstructions`, `contacts[]`          |
| Lifecycle   | `createdBy/At`, `updatedBy/At`, `archivedAt/By`                                                                                                                                                                                                                                                                  |

**No passwords, PINs or OTP values exist anywhere in the schema.**

### Valuation

`id`, `amountMinor`, `currency`, `valuationDate`, `source` (statement · app_or_website · document · conversation · estimate · sync), `sourceNote`, `confidence` (estimated · verified), `enteredBy`, `enteredAt`, `provider` (sync only), `setAside` ({by, at, note}).

### Derived verification status (`deriveValue`)

| Status                  | Rule                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not yet entered         | No valuations (that aren't set aside)                                                                                                                                        |
| Waiting for statement   | `awaitingStatement` is on                                                                                                                                                    |
| Conflicting information | `conflict` lists ≥ 2 valuations. Both are shown; neither is counted until someone settles it. Two _verified_ amounts for the same date that differ raise this automatically. |
| Verified                | Latest non-set-aside verified valuation, dated within 180 days                                                                                                               |
| Outdated                | Latest verified valuation is older than 180 days (shown, but not counted as verified)                                                                                        |
| Estimated               | Only estimates exist                                                                                                                                                         |

A newer **estimate never replaces** a verified value; it's shown alongside as "a newer estimate".

### Calculations (`calculations.ts`)

- `computeTotals`: assets − outstanding liabilities, skipping archived, closed and double-counted child accounts. Returns verified vs unverified asset amounts, credit limits (info only), and lists of accounts with missing or conflicting values. `isComplete` is false whenever any are missing.
- `breakdown(dimension)`: asset class, institution, manager, liquidity, verification status, owner (joint groups are labelled "Joint: Mumma & Papa").
- `personView`: attributes to a person only sole confirmed ownership and confirmed shares; joint/unconfirmed accounts are listed separately, never split by assumption.
- `upcomingMaturities`, `attentionItems` ("Things to check" derived from the data).

### Note

`kind` (note · question), `title`, `body`, `authorId`, `history[]` (previous bodies with who/when), `pinned`, `resolvedAt/By`, optional `accountId` / `planId`, `comments[]` (each with its own `history`), `archivedAt/By`. Only a comment's author can edit it.

### Plan

`title`, `category` (free text — any plan type), `description`, `status` (idea · discussing · researching · decided · in_progress · completed · on_hold), `proposedBy`, `targetDate`, `budgetMinor`, `relatedAccountIds`, `tasks[]`, `entries[]`.

`PlanEntry.type` is `proposal`, `discussion`, `decision` or `action_item`. A decision is recorded explicitly (`plan.recordDecision`); its author agrees by default and others add agreement themselves (`plan.agree`). Editing a decision's wording resets agreement. Discussion never changes a plan's status automatically.

### CheckItem ("Things to check")

`title`, `detail`, `accountId`, `createdBy`, `doneAt/By`, `doneNote`, `archivedAt`. Not assigned to anyone by default.

### DocumentRef

Index only: `title`, `kind`, `whereKept`, `documentDate`, `accountIds`, `note`. No file content.

### AuditEntry

`id`, `seq`, `at`, `actorId`, `category` (record · security), `action` (e.g. `valuation.add`, `access.reveal`), `entityType`, `entityId`, `entityLabel`, `summary` (plain English), `changes[]` ({field, before, after}), `reason`, `prevHash`, `hash` = SHA-256(prevHash + canonical JSON of the entry).

## Commands

All writes are one of the commands in `commands.ts` (`account.create`, `account.update`, `account.archive`, `account.restore`, `account.setAwaitingStatement`, `valuation.add/verify/setAside/flagConflict/resolveConflict`, `note.*`, `plan.*`, `check.*`, `document.*`, `person.*`). Edits of existing records carry `expectedVersion`.

## Private repository layout

```
FORMAT.md                    plaintext description, no secrets
ledger/state.json.enc        LedgerState
audit/head.json.enc          {seq, hash, months[]}
audit/2026-10.json.enc       AuditEntry[] for that month
snapshots/index.json.enc     SnapshotMeta[]
snapshots/snap_<id>.json.enc LedgerState copy
```

Envelope format: `{"fl":1,"alg":"A256GCM","kid":"k1","iv":"<base64 96-bit>","ct":"<base64 ciphertext+tag>"}`, AAD = `family-ledger:v1:<path>`.

## Schema changes

1. Make the change in `schema.ts` and bump `SCHEMA_VERSION`.
2. Add `MIGRATIONS[oldVersion]` in `migrations.ts` that transforms raw JSON.
3. Add a test with a fixture of the old version.
4. Deploy the API; files are migrated in memory on read and re-written on the next change. Snapshots migrate when restored.
