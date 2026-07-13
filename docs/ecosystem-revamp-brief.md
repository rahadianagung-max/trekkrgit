# SportsActvd Ecosystem Revamp — Design Brief for Claude Code

**Scope:** Revamp of `trekkr.online` and `turnamenpadel.com` so the SportsActvd ecosystem synergy is visible in the interface itself. Both sites are static HTML deployed on Vercel/Netlify with a Google Sheets + serverless backend. Do not change backend endpoints or data contracts — this is a frontend/IA revamp only.

---

## 1. The One Idea Everything Serves

**"Berapa ELO kamu?" — What's your ELO?**

ELO is the shared currency of the ecosystem. Every site answers one question about it:

| Site | Role | User verb |
|---|---|---|
| trekkr.online | The rating itself | **Check** your ELO |
| turnamenpadel.com | Where ratings are proven | **Prove** your ELO |
| stellarsquadacademy.com | Where ratings are raised | **Raise** your ELO |
| sportsactvd.com | Where the ecosystem meets brands | **Sponsor** the players behind the ELO |

Every design decision below exists to make this loop legible to a first-time visitor within 5 seconds, without them ever needing to understand the holding-company structure.

---

## 2. Shared Design System ("Ecosystem Kit")

Build this once as a small shared layer both sites import (a single `ecosystem.css` + `ecosystem.js`, copied into each repo or served from trekkr.online — choose whichever fits the current deploy setup; do not introduce a build system if the sites don't have one).

### 2.1 Tokens

- **Palette (shared):**
  - `--ink` #101010 (near-black, primary text / dark surfaces)
  - `--paper` #F7F5F0 (off-white background)
  - `--ember` #E85D26 (Trekkr orange — the ecosystem accent, used for ELO numbers and primary CTAs only)
  - `--court` #1E5A46 (deep padel-court green — secondary accent, used for "verified" states and TurnamenPadel identity)
  - `--line` #D8D4CC (hairlines, borders)
  - `--elo-gold` #C9A227 (reserved: top-10 / champion states only)
- **Rule of accent:** `--ember` is precious. If more than ~3 elements per viewport are orange, remove some. ELO numbers are *always* orange, everywhere, on both sites — that repetition is how users learn the currency.
- **Type:**
  - Display: a condensed, athletic sans (e.g. **Archivo Expanded/Black** or **Barlow Condensed Bold**) — scoreboard energy, used for headlines and big numbers.
  - Body: **Inter** or system sans, quiet and legible.
  - Data/mono: a tabular-figure mono (e.g. **JetBrains Mono** or `font-variant-numeric: tabular-nums`) for every ELO value, match score, and ranking table. Ratings should *look* like data, not marketing.
- **Avoid:** cream + serif + terracotta template look; dark-mode-with-acid-green look. The identity here is *scoreboard/passport*, not editorial.

### 2.2 The Ecosystem Bar (signature element #1)

A slim persistent strip (top of page, above the main nav, ~32px, `--ink` background) shown identically on both sites:

```
[ SPORTSACTVD ]   Trekkr · Rankings   |   TurnamenPadel · Tournaments   |   Stellar · Academy        ▸ What's your ELO?
```

- Current site's name is highlighted; others link out.
- On mobile it collapses to: `SPORTSACTVD ▾` (tap → sheet with the 4 destinations, each with its one-line role: "Check your rating", "Play verified tournaments", "Train with champions", "Partner with us").
- This bar is the structural proof of synergy. It must be pixel-identical across both sites.

### 2.3 The Player Passport Card (signature element #2)

A reusable card component rendering a player as a "passport": name, current ELO (big, orange, mono), rank, matches played, last event, and **provenance chips** showing where the data came from:

```
┌─────────────────────────────────┐
│ AGUNG W.                 ⬢ 1284 │
│ Rank #37 · 62 matches           │
│ ─────────────────────────────── │
│ ✓ 4 tournaments  ✓ Stellar L2   │
│   (TurnamenPadel)  (Academy)    │
└─────────────────────────────────┘
```

- The chips are the synergy made tangible: a tournament badge links to the event page on turnamenpadel.com; an academy badge links to Stellar. One card, three businesses.
- Use this same component on: Trekkr rankings rows (expanded state), Trekkr player pages, TurnamenPadel bracket player popovers, and the existing share-card generator (keep 1080×1920 export working).

### 2.4 Shared footer

Identical 4-column ecosystem footer on both sites: Trekkr / TurnamenPadel / Stellar Academy / SportsActvd, each with a one-line role description and link. Copyright line: `© 2026 SportsActvd — Trekkr · TurnamenPadel · Stellar Academy`.

---

## 3. trekkr.online Revamp

**Positioning shift:** from "a leaderboard site" to **the passport of Indonesian padel** — the neutral record everything else plugs into.

### 3.1 Hero

Replace the current generic hero with a working, live moment:

- H1: **"What's your ELO?"** (display face, very large)
- Directly under it: the existing player search, restyled as the hero's primary action — one large input, placeholder `Search your name…`, orange submit. The search *is* the hero. No decorative imagery competing with it.
- Beneath the search, one line of proof in mono: `— players rated · — matches recorded · updated daily` (bind to the existing live stats endpoint; keep skeleton loading states, never show "Loading…" as raw text).

### 3.2 The Journey strip (new section, the synergy pitch)

A horizontal 3-step strip right after the hero — this is where a new visitor learns the ecosystem without reading paragraphs:

```
①  PLAY            ②  PROVE                    ③  PROGRESS
Any match at a     Enter a TurnamenPadel        Train at Stellar Academy —
partner venue      event — results are          your ELO gain is measured,
counts.            verified & synced.           not promised.
[Find venues]      [See tournaments →]          [Visit academy →]
```

Numbering is legitimate here — it is an actual sequence (a player's journey). Keep copy to one sentence per step. Steps ② and ③ are the cross-sell surfaces; style their CTAs in `--court` green so outbound ecosystem links have a consistent color meaning.

### 3.3 Rankings & PlayRank pages

- Every table: tabular-nums mono for numbers, orange ELO column, hairline `--line` row dividers, zebra-free.
- Add a **"Verified" column/chip** on players whose recent matches came from TurnamenPadel events (data already distinguishes event-sourced matches — surface it). Tooltip: "Result recorded at an official TurnamenPadel event."
- Row expand → Player Passport Card (§2.3).

### 3.4 Keep, don't break

- Admin (venue login) link, Market Intelligence, How Trekkr Works, Get Listed — keep routes and auth untouched, restyle only.
- Existing entitlement/teaser logic for premium analytics (WOWY, Partner-Fit) stays; give locked analytics a consistent "🔒 Pro insight" treatment with an ego-positive teaser line, per the existing monetization design.
- All existing API contracts (including the `p.player / p.new_elo / p.elo_change` field names) are untouched.

---

## 4. turnamenpadel.com Revamp

**Positioning shift:** from "tournament software" to **the proving ground** — the only tournaments where results permanently count.

### 4.1 Hero

- Keep the strong existing line — it's the best copy in the ecosystem: *"Anyone can run a tournament. We build tournaments players trust."*
- Add one ecosystem-anchoring subline: **"Every result becomes a verified entry in the player's Trekkr passport."**
- Primary CTA `Run a tournament with us` (orange), secondary `Try the engine` (ghost). Third quiet link: `Check a player's ELO →` (goes to Trekkr rankings — keep this, it's a great trust device for organizers screening sandbaggers).

### 4.2 The trust loop diagram (new section)

A simple horizontal loop, drawn in hairlines (SVG, no stock illustration):

```
  MATCH PLAYED ──▸ SCORED LIVE ──▸ SYNCED TO TREKKR ──▸ RATING UPDATED
       ▲                                                      │
       └────────────── SEEDING FOR NEXT EVENT ◂───────────────┘
```

Caption: "Seeding from real ratings in, verified results out. That's why there's nowhere for sandbaggers to hide." This one diagram explains the Trekkr↔Turnamen synergy better than any paragraph.

### 4.3 Formats & products

- Keep the two-offer structure (We Run It For You / License the Engine) — it's clear. Restyle as two equal cards; add starting-price anchors if Agung provides them, otherwise `Contact for pricing`.
- Formats section: keep Playoff Championship / Double Path / Community League. Add a fourth card for **Ranked Event (RE)** — the 36-player two-phase tiered Mexicano — since it's live and differentiated: "One-day ranked format. 36 players, tiered Mexicano, every match rated."
- TV/LED and per-player phone schedule features: show them, don't tell — one screenshot or a small looping mock of the actual TV bracket view and a phone schedule, side by side. These already exist in the product; reuse real UI.

### 4.4 Sponsor surface (feeds SportsActvd)

Add a short section for brands: "Your logo on every court LED, bracket screen, and player phone." CTA → sportsactvd.com contact. This is TurnamenPadel's contribution to the sponsorship business — make it visible but secondary to the player/organizer story.

---

## 5. Cross-Site Behaviors (the synergy mechanics)

1. **Deep links carry identity:** from any TurnamenPadel bracket, clicking a player opens their Trekkr profile (`trekkr.online/player/<id>`); from any Trekkr profile, tournament badges link back to the event page. Use existing Player_IDs (the dedup tool's canonical IDs).
2. **Consistent ELO rendering:** one shared formatter — orange, mono, with delta arrows (`▲ +12` in green `--court`, `▼ −8` muted) — used in rankings, brackets, and share cards.
3. **Shared OG/share cards:** both sites' share images use the passport visual language so anything shared to Instagram/WA is instantly recognizable as the same ecosystem.
4. **UTM/cross-link tracking:** append `?ref=trekkr` / `?ref=turnamen` on ecosystem links so cross-sell traffic is measurable from day one.

---

## 6. Quality Floor (non-negotiable)

- Fully responsive; mobile is primary (most players will open these from WA/IG links). Test at 360px.
- Skeleton states for all live data; no raw "Loading…" text.
- `prefers-reduced-motion` respected; keep motion to one orchestrated hero reveal + hover states, nothing scroll-jacky.
- Keyboard focus visible; color contrast AA on `--paper` and `--ink` surfaces.
- Lighthouse: no regressions vs current; keep pages static-fast.
- SEO: proper `<title>`/meta per page; Trekkr = "Padel ELO rating & rankings Indonesia", Turnamen = "Padel tournament management Indonesia". (Note for later: Stellar & SportsActvd sites are JS-rendered and nearly invisible to crawlers — out of scope here, but the ecosystem bar should still link to them.)

---

## 7. Suggested Build Order for Claude Code

1. Extract shared `ecosystem.css` tokens + Ecosystem Bar + shared footer; drop into both repos.
2. Trekkr hero + Journey strip.
3. Passport Card component; wire into rankings + player pages + share-card generator.
4. TurnamenPadel hero + trust-loop diagram + RE format card.
5. Cross-links with canonical Player_IDs + ref params.
6. Responsive/a11y pass, then screenshot both sites side by side and verify the two homepages read as siblings, not twins: same bar, same footer, same ELO treatment — but Trekkr leans `--paper`/light (a record, a ledger) and TurnamenPadel leans `--ink`/dark (an arena, an event night).

**Definition of done:** a first-time visitor landing on either site can, within 5 seconds, (a) understand what an ELO is for, (b) find their own name, and (c) see there are two more places — tournaments and an academy — where that number gets used.
