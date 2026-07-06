# Trekkr Sabermetrics

Padel analytics for Trekkr: a player's **true contribution** (isolated from their
partner and opponents) plus their **best-fit partner**. Prototype built on a real
snapshot of trekkr.online data (7 venues, 77 players).

**`index.html` is fully self-contained** — React, the code, and the data are all
inside that one file. Nothing else is needed to run it.

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

The source lives in `src/app.jsx` and the data in `data.js`. After editing:

```bash
npm install
npm run build      # regenerates the self-contained index.html
```

## Swapping in live data

`data.js` holds the analytics as `window.__TREKKR_DATA__`. To go live, replace it
with a fetch from the Trekkr sabermetrics endpoints (keyed by stable Player_ID via
the alias map), in this shape:

```js
{ venues: [ { name, region, location, count, rows,
    players: [ { name, gender, impact, se, winRate, apps, valueAdded,
      impactRank, winRateRank,
      bestFit: [ { partner, pairScore, partnerBeta, synergy, shared } ],
      worstFit: { partner, synergy, shared } } ] } ] }
```

Then run `npm run build` to re-embed it.
