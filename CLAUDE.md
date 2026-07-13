# CLAUDE.md

Guidance for AI assistants (Claude Code) working in this repository.

## What this is

**Trekkr** (`trekkr.online`) is a padel ELO rating & rankings platform for
Indonesia. It is a **static multi-page website** (plain HTML/CSS/JS, no
framework, no client build step) backed by a **single serverless function**
that bridges to a **Google Sheet** used as the database.

- **Frontend:** hand-written `.html` pages + a shared theme (`trekkr-theme.css`)
  and a shared API client (`trekkr-api.js`). No React on the main site, no
  bundler, no `node_modules` shipped to the browser.
- **Backend:** one big serverless handler (`api/sheet.js`) that exposes a REST
  API under `/api/*` and reads/writes Google Sheets tabs via the `googleapis`
  service account.
- **Database:** a Google Spreadsheet (`GOOGLE_SHEET_ID`). Each logical table is
  a tab (see `TABS` in `api/sheet.js`).
- **Hosting:** deployed to both **Vercel** (`vercel.json`, primary) and
  **Netlify** (`netlify.toml`). Subdomains (`venue.`, `admin.`, `superadmin.`)
  are served by rewrites to their respective subdirectories.

Note: much of the code, comments, and commit history is in **Indonesian**.
Match the surrounding language when editing comments; keep code identifiers
in English.

## Repository layout

### Backend
- `api/sheet.js` — **the active backend** (~4500 lines). Vercel serverless
  function; ends with a Vercel adapter (`module.exports = async (req, res)`)
  wrapping the internal `netlifyHandler`. All routes are registered here.
- `netlify/functions/sheet.js` — **older/partial copy** (~1200 lines) used only
  by the Netlify deploy target. It lags behind `api/sheet.js`. Treat
  `api/sheet.js` as the source of truth; only touch the Netlify copy if you are
  deliberately maintaining the Netlify deployment.
- `package.json` — backend deps only (`googleapis`). Root has no build.

### Shared frontend assets
- `trekkr-theme.css` — the brand design system: CSS custom properties (tokens),
  header/nav/footer chrome, buttons, utilities. Linked once per page; page
  styles live in each page's own `<style>` block.
- `trekkr-api.js` — the browser API client (`TrekkrAPI` IIFE). Wraps `fetch`,
  stores the auth token/role/venue in `localStorage`, and exposes typed helpers
  (`getPlayers`, `saveSession`, `getTierName(elo)`, etc.). Copied into several
  subdirs (`admin/`, `player/`, `superadmin/`, `venue/`) that are served as
  separate origins/subdomains.

### Top-level pages (main domain)
`index.html` (home), `rankings.html`, `playrank.html`, `tournament.html`,
`how-trekkr-works.html`, `about.html`, `market.html`, `register.html`,
`recap.html`, plus the `re-*.html` (Ranked Event) and `reg-admin.html` /
`marketintelligence.html` tools. Clean URLs (`/rankings` → `rankings.html`) are
configured in `netlify.toml`. Some `dir/index.html` variants exist for the same
routes — keep them in sync when restyling.

### App subdirectories
- `admin/`, `superadmin/`, `venue/` — role-scoped SPAs served on subdomains.
- `player/` — public player passport (`/player/<name>` → `player/index.html`).
- `tourney/` — the tournament engine (admin, mobile scorer, TV view). Has its
  own `shared.js` (data/sync layer) and a `sheet.js`.
- `registration/`, `tournament/`, `tournaments/`, `mexicano/`, `events/`,
  `get-listed/`, `market/`, `rankings/`, `about/`, `how-trekkr-works/`,
  `playrank/` — page/app folders.
- `analytics/` — the **only** subproject with a build. A React + esbuild
  "Sabermetrics" prototype (`build.mjs`, `src/app.jsx`, `src/i18n.js`,
  `src/live.js`) that fetches the live Trekkr API and computes player
  contribution/partner-fit in the browser. See `analytics/README.md`. It is
  self-contained in `analytics/index.html`; the `src/` + build exist only for
  editing convenience.

## Backend architecture (`api/sheet.js`)

- **Entry:** `netlifyHandler(event)` normalizes the path (strips
  `/.netlify/functions/sheet`, `/api/`), parses body/query, then matches a long
  `if (path === ... && method === ...)` route table. Unmatched → `404`.
- **Sheets access:** `getSheets()` / `getDrive()` build a `google.auth.JWT` from
  `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`. All data lives in the
  spreadsheet `GOOGLE_SHEET_ID`; tab names are in the `TABS` map. Rows are read
  with `spreadsheets.values.get`/`batchGet` over `A2:…` ranges and written with
  `values.append`/`update` (`USER_ENTERED`).
- **Auth:** `login()` looks the user up in the `Admins` tab and returns a
  base64 token `username:role:venue:timestamp`. This is a lightweight,
  **not cryptographically signed** token. Do not weaken it further; treat the
  auth/login flow and the `Admins` tab as sensitive.
- **Image uploads:** `uploadImage()` prefers imgbb (`IMGBB_API_KEY`) and falls
  back to Google Drive. Used for venue logos, registration photos, payment
  proofs.
- **AI features:** dedup matching and event recaps call the Anthropic API
  (`ANTHROPIC_API_KEY`, models via `ANTHROPIC_MODEL` /
  `ANTHROPIC_RECAP_MODEL`).
- **Feature areas** (route prefixes): `players/*`, `venues/*`, `sessions`,
  `elo/*`, `admins`, `settings`, `tournament/*`, `reg/*`, `dedup/*`, `recap/*`,
  `re/*` (Ranked Event — 36-player two-phase tiered Mexicano), `parse`
  (Americano URL import), `get-listed` (venue leads).

### Environment variables (server-side)
`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`,
`IMGBB_API_KEY`, `GOOGLE_PHOTO_FOLDER_ID`, `REG_DRIVE_FOLDER_ID`,
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_RECAP_MODEL`.
Never hard-code secrets; read them from `process.env`.

## ELO / tiers

Tier thresholds are defined in **two places that must stay consistent**:
`trekkr-api.js` (`getTierName`/`getTierClass`/`getNextTier`) on the client and
the tier/level constants in `api/sheet.js` (`LEVEL_ELO`, etc.).

Tiers: Beginner (<900) · Upper Beginner (900) · Lower Bronze (1200) ·
Bronze (1500) · Upper Bronze (1800) · Silver (2100) · Gold (2500) ·
Platinum (3000).

**ELO write contract (do not rename):** when matches/ELO are submitted, each
row uses the field names `player`, `new_elo`, `elo_change` (see the ELO_Log
append in `api/sheet.js`). Renaming these breaks the sheet schema and every
client that reads it.

## Local workflow

There is no root build or test suite. To work on the frontend, serve the repo
statically and open pages directly:

```bash
# any static server works; pages are plain HTML
python3 -m http.server 8000    # then open http://localhost:8000/rankings.html
```

The backend can't run fully without the Google service-account env vars and a
real spreadsheet, so most backend changes are verified by reading the code and
deploying to a preview. The `analytics/` subproject builds with:

```bash
cd analytics && npm install && npm run build   # esbuild → self-contained bundle
```

## Conventions

- **No frameworks / no build on the main site.** Keep pages as static
  HTML/CSS/JS. Do not add a bundler, a framework, or new runtime dependencies to
  the root or to any page outside `analytics/`.
- **Design tokens live in `trekkr-theme.css`** (`--orange #FF6A00`, `--grad`,
  the `--display`/`--body` font roles, radii). Reuse tokens; don't hard-code
  brand colors inline. Page-specific CSS stays in the page's `<style>` block.
- **Shared JS is duplicated across app folders** (`trekkr-api.js` copies). If
  you change the API client, update every copy (`./`, `admin/`, `player/`,
  `superadmin/`, `venue/`) so subdomains don't drift.
- **Routing lives in `netlify.toml` and `vercel.json`.** Adding a page usually
  means adding a rewrite. Don't rename or delete existing routes without a
  redirect — external links depend on them.
- **API contract stability.** The Google Sheet column order and JSON field
  names are a contract shared by many pages. Adding fields is fine; renaming or
  reordering existing ones is a breaking change.

## Git & PR workflow

- Small, focused commits with clear messages (history is mostly one PR per
  feature, e.g. `Rankings: resolve alias-recorded ELO_Log names…`).
- Develop on the branch you were assigned; push with
  `git push -u origin <branch>`. Do not open a PR unless explicitly asked.
- After visual/frontend changes, describe what changed and list the files
  touched before committing.

---

## Project Instructions — Ecosystem Revamp

This repo is part of the **SportsActvd ecosystem** (Trekkr + TurnamenPadel +
Stellar Squad Academy + SportsActvd). An in-progress **frontend/IA revamp** is
governed by [`docs/ecosystem-revamp-brief.md`](docs/ecosystem-revamp-brief.md) —
that brief is the **single source of truth** for design tokens, components,
copy, and build order for all UI work. Read it fully before any revamp work.

- All UI/frontend revamp work must follow `docs/ecosystem-revamp-brief.md`
  exactly. This is a **frontend/IA revamp ONLY**.

### Hard rules (never violate)
- **NEVER** change any backend endpoint, API contract, or data field names. In
  particular the ELO submission contract uses `player` / `new_elo` /
  `elo_change` (referenced as `p.player`, `p.new_elo`, `p.elo_change`) — never
  rename these.
- **NEVER** touch admin auth, entitlement/token logic, or ELO calculation code.
- **Do not** introduce a build system, framework, or new dependencies on the
  main site. These are static HTML/CSS/JS pages — keep them that way. (The
  existing `analytics/` esbuild prototype is the only exception.)
- **Do not** delete or rename existing routes/pages. Restyle only.
- Every ELO number rendered anywhere must go through the shared formatter/ELO
  treatment (orange, tabular mono, delta arrows) rather than ad-hoc markup.

### Revamp workflow
- Work in small commits with clear messages.
- After visual changes, describe what changed and list the files touched before
  committing.
- If a change appears to violate the brief, stop and re-read
  `docs/ecosystem-revamp-brief.md` and this file before continuing.
