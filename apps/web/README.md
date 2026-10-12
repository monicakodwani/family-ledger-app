# Family Ledger — web app (`@family-ledger/web`)

Mobile-first PWA (Vite + React 18 + TypeScript + Tailwind v4 + Radix + TanStack Query).
All data goes through the `LedgerClient` interface from `@family-ledger/shared`:

- **Demo mode** (`DemoLedgerClient`, `src/data/demoClient.ts`): fictional data in browser memory only. Resets on reload.
- **Connected mode** (`HttpLedgerClient`, `src/data/httpClient.ts`): calls the API with a Supabase access token
  (`cache: "no-store"`, `credentials: "omit"`). Sign-in via passkey (Face ID) or email link (`src/auth/`).

The demo client is loaded through a build-time-guarded dynamic import, so connected builds contain no demo/seed data.
Family data is never written to localStorage, IndexedDB or the service-worker cache; only UI preferences
(`fl.pref.*`: text size, language, "maybe later" for the Face ID offer) are stored.

## Environment variables

| Variable                        | Needed for | Notes                                                                                                   |
| ------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`             | connected  | Must be `https://` (http://localhost allowed only for `vite dev`). **Must not be set for demo builds.** |
| `VITE_SUPABASE_URL`             | connected  | `https://<project>.supabase.co`                                                                         |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | connected  | Publishable (anon) key — never a service key.                                                           |
| `VITE_BASE_PATH`                | optional   | Base path for GitHub Pages project sites, e.g. `/family-ledger/` (default `/`).                         |
| `VITE_APP_MODE`                 | optional   | `demo` / `connected`; normally derived from `--mode`.                                                   |

`vite.config.ts` fails the build if the connected variables are missing or not https, or if a demo build sets
`VITE_API_BASE_URL` (logic in `config/envGuard.ts`, unit tested). Put local values in `.env.connected`
(git-ignored); see `.env.example`.

## Scripts

| Script                                     | What it does                                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev -w @family-ledger/web`        | Dev server, connected mode (needs env vars).                                                                                                                                  |
| `npm run dev:demo -w @family-ledger/web`   | Dev server, demo mode.                                                                                                                                                        |
| `npm run build -w @family-ledger/web`      | Production build, connected mode.                                                                                                                                             |
| `npm run build:demo -w @family-ledger/web` | Production build, demo mode.                                                                                                                                                  |
| `npm run preview -w @family-ledger/web`    | Serve `dist/` on http://localhost:4173.                                                                                                                                       |
| `npm run typecheck -w @family-ledger/web`  | `tsc --noEmit`.                                                                                                                                                               |
| `npm run test -w @family-ledger/web`       | Vitest unit/component tests (jsdom).                                                                                                                                          |
| `npm run test:e2e -w @family-ledger/web`   | Playwright against the demo build (`iphone` = WebKit iPhone 14, `desktop chromium`). Run `npx playwright install webkit chromium` once. Screenshots go to `e2e/screenshots/`. |

## Hosting notes (GitHub Pages)

- `dist/404.html` is a copy of `index.html` so deep links and refreshes work with `BrowserRouter`.
- A strict Content-Security-Policy and `referrer: no-referrer` are injected as `<meta>` tags at build time
  (`connect-src` only allows the API and Supabase origins).
- `public/sw.js` caches only same-origin static files under the base path; it never caches `/api`, cross-origin,
  or `Authorization`-carrying requests. It is registered in production builds only.
- `public/manifest.webmanifest` uses relative `start_url`/`scope`, so it works under any base path.
  Icons are generated by `node scripts/make-icons.mjs`.
