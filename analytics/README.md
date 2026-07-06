# Trekkr Sabermetrics

Padel analytics for Trekkr: a player's **true contribution** (isolated from their
partner and opponents) plus their **best-fit partner**.

**Live data.** The page pulls venues, players and matches straight from the
Trekkr API (`/api/venues`, `/api/players`, `/api/venues/<name>/matches`) at load
time and computes the sabermetrics in the browser. Any **new venue or player**
on trekkr.online shows up automatically — no rebuild needed. (It used to ship a
frozen `data.js` snapshot, which is why new venues never appeared in the club
dropdown.)

**`index.html` is self-contained** — React and the code are inside that one file;
the data is fetched at runtime.

## Easiest way to get it running (one file, ~2 minutes)

1. Create a new repository on GitHub (e.g. `trekkr-sabermetrics`).
2. Click **Add file → Upload files**, and drag in **`index.html`** (just that one
   file is enough). Commit.
3. Go to the repo's **Settings → Pages**. Under **Source**, choose
   **Deploy from a branch**, pick branch **`main`** and folder **`/ (root)`**, Save.
4. Wait ~1 minute, then open the link GitHub shows
   (`https://<your-username>.github.io/<repo>/`). Done.

> GitHub by itself only shows your code — **GitHub Pages** (step 3) is what actually
> serves the page. That's the step that was missing.

### Even faster: Vercel (you already use it for Trekkr)

Go to vercel.com → **Add New → Project** → import this repo → Framework preset
**Other** → **Deploy**. It gives you a live URL immediately.

### Add it to the existing Trekkr site instead

Just copy `index.html` into your site (rename e.g. `sabermetrics.html`) and link it
from the nav. It already uses the same fonts/theme as trekkr.online.

## Editing it later (optional)

- `src/app.jsx` — the UI.
- `src/live.js` — the live data layer: fetches the Trekkr API and computes the
  sabermetrics (ridge-regression impact, win rate, best-fit partner) into this
  shape:

  ```js
  { venues:  [ { name, region, location, count, rows, players: [Player] } ],
    players: [Player] }   // global, cross-venue list for "By players"
  // Player = { name, gender, impact, se, winRate, apps, valueAdded,
  //   impactRank, winRateRank,
  //   bestFit: [ { partner, pairScore, partnerBeta, synergy, shared } ],
  //   worstFit: { partner, synergy, shared } }
  ```

  Player analysis is **global**: impact, confidence, value added and best-fit /
  worst-fit partners come from one ridge regression over *all* matches across
  every venue, so a player has a single rating and their best partner can be
  from any club. Match count and win rate stay contextual — club-specific in a
  venue roster, global in the cross-venue `players` list. (Because impact is
  only comparable within a connected pool, cross-venue ranks are most meaningful
  where players actually move between clubs.)

After editing:

```bash
npm install
npm run build      # regenerates the self-contained index.html
```

### Notes on the model

`impact` is an adjusted plus/minus: a ridge regression on match point
differential where each player is +1 for their team and −1 against, so a
player's rating is isolated from partners and opponents. `RIDGE`, `MARGIN_CAP`
and the partner-chemistry shrinkage (`SYN_K`) are tunable constants at the top of
`src/live.js`.
