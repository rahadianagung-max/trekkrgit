/* live.js — Trekkr Sabermetrics live data layer.
 *
 * Fetches the real Trekkr data at page load and computes the sabermetrics the
 * UI expects, so any NEW venue or player shows up automatically — no rebuild.
 *
 * Player analysis is GLOBAL: a player's impact, confidence, value added and
 * best-fit / worst-fit partners are computed from ALL of their matches across
 * every venue at once (one ridge regression over the whole match pool), not
 * per club. Match count and win rate stay contextual — club-specific in the
 * "By club" roster, global in "By players".
 *
 * Output:
 *   { venues: [ { name, region, location, count, rows, players:[Player] } ],
 *     players: [Player] }               // global list for "By players"
 *   Player = { name, gender, impact, se, winRate, apps, valueAdded,
 *              impactRank, winRateRank,
 *              bestFit:[ { partner, pairScore, partnerBeta, synergy, shared } ],
 *              worstFit:{ partner, synergy, shared } }
 */

// Same rule the rest of the site uses (trekkr-api.js): call /api on the main
// domain, fall back to the absolute URL from anywhere else.
const BASE =
  typeof window !== "undefined" && window.location.hostname === "trekkr.online"
    ? "/api"
    : "https://trekkr.online/api";

async function api(path) {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`API ${path} → HTTP ${res.status}`);
  return res.json();
}

// --- tuning ------------------------------------------------------------------
const RIDGE = 1.5; // regularization: shrinks low-sample players toward average
const SYN_K = 2; // partner-chemistry shrinkage (more shared games → more trust)
const MARGIN_CAP = 6; // cap each match's point differential (keeps units ~games)
const MAX_PARTNERS = 8; // best-fit shortlist length

const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const norm = (s) => (s || "").trim();

// Keep only decided 2-v-2 matches with four named players.
function decidedMatches(rawMatches) {
  return (rawMatches || []).filter((m) => {
    const ps = [m.p1t1, m.p2t1, m.p1t2, m.p2t2].map(norm);
    if (ps.some((p) => !p)) return false;
    return (m.scoreT1 || 0) !== (m.scoreT2 || 0);
  });
}

// Solve (A x = b) and return diag(A^{-1}) too, via Gauss-Jordan on [A | I | b].
// A is small and, thanks to ridge, well-conditioned.
function solveWithInverseDiag(A, b) {
  const n = A.length;
  if (n === 0) return { x: [], invDiag: [] };
  const width = 2 * n + 1;
  const M = A.map((row, i) => {
    const r = row.slice();
    for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0);
    r.push(b[i]);
    return r;
  });
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) continue; // ridge should prevent this
    if (piv !== col) {
      const t = M[piv];
      M[piv] = M[col];
      M[col] = t;
    }
    const d = M[col][col];
    for (let j = col; j < width; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let j = col; j < width; j++) M[r][j] -= f * M[col][j];
    }
  }
  const x = new Array(n);
  const invDiag = new Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = M[i][2 * n];
    invDiag[i] = M[i][n + i];
  }
  return { x, invDiag };
}

// Fit the ridge "adjusted plus/minus" model over a set of matches.
// Each row is +1 for a player's team and −1 against, target = point
// differential, so a rating is isolated from partners and opponents.
function ridgeModel(matches) {
  const names = [];
  const idx = {};
  const ensure = (nm) => {
    if (!(nm in idx)) {
      idx[nm] = names.length;
      names.push(nm);
    }
    return idx[nm];
  };
  for (const m of matches)
    for (const p of [m.p1t1, m.p2t1, m.p1t2, m.p2t2]) ensure(norm(p));
  const n = names.length;

  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const rhs = new Array(n).fill(0);
  const apps = new Array(n).fill(0);
  const wins = new Array(n).fill(0);
  const genderVotes = names.map(() => ({}));
  const pairs = {}; // "i|j" (i<j) -> { shared, marginSum }
  const addPair = (i, j, margin) => {
    const key = i < j ? `${i}|${j}` : `${j}|${i}`;
    (pairs[key] || (pairs[key] = { shared: 0, marginSum: 0 })).shared++;
    pairs[key].marginSum += margin;
  };

  for (const m of matches) {
    const a = idx[norm(m.p1t1)],
      b = idx[norm(m.p2t1)],
      c = idx[norm(m.p1t2)],
      d = idx[norm(m.p2t2)];
    const t1 = [a, b],
      t2 = [c, d];
    const y = clamp((m.scoreT1 || 0) - (m.scoreT2 || 0), -MARGIN_CAP, MARGIN_CAP);
    const g = (m.gender || "").toUpperCase() === "F" ? "F" : "M";
    for (const p of [...t1, ...t2]) {
      apps[p]++;
      genderVotes[p][g] = (genderVotes[p][g] || 0) + 1;
    }
    if (y > 0) t1.forEach((p) => wins[p]++);
    else t2.forEach((p) => wins[p]++);

    for (const p of t1) {
      A[p][p] += 1;
      rhs[p] += y;
    }
    for (const p of t2) {
      A[p][p] += 1;
      rhs[p] -= y;
    }
    A[a][b] += 1;
    A[b][a] += 1;
    A[c][d] += 1;
    A[d][c] += 1;
    for (const p of t1)
      for (const q of t2) {
        A[p][q] -= 1;
        A[q][p] -= 1;
      }
    addPair(a, b, y);
    addPair(c, d, -y);
  }
  for (let i = 0; i < n; i++) A[i][i] += RIDGE;

  const { x: beta, invDiag } = solveWithInverseDiag(A, rhs);

  let ssr = 0;
  for (const m of matches) {
    const y = clamp((m.scoreT1 || 0) - (m.scoreT2 || 0), -MARGIN_CAP, MARGIN_CAP);
    const pred =
      beta[idx[norm(m.p1t1)]] +
      beta[idx[norm(m.p2t1)]] -
      beta[idx[norm(m.p1t2)]] -
      beta[idx[norm(m.p2t2)]];
    ssr += (y - pred) ** 2;
  }
  const sigma2 = matches.length ? ssr / matches.length : 0;
  return { names, idx, beta, invDiag, sigma2, apps, wins, pairs, genderVotes };
}

// Turn a fitted model into player objects (global impact + best-fit partners)
// keyed by lowercased name, plus a list ranked by impact.
function buildPlayers(model, genderMap, displayMap) {
  const { names, beta, invDiag, sigma2, apps, wins, pairs, genderVotes } = model;
  const n = names.length;
  const meanBeta = n ? beta.reduce((s, v) => s + v, 0) / n : 0;

  const players = names.map((nm, i) => {
    const key = nm.toLowerCase();
    const votes = genderVotes[i];
    const derived = (votes.F || 0) > (votes.M || 0) ? "F" : "M";
    const se = clamp(Math.sqrt(Math.max(0, sigma2 * invDiag[i])), 0.05, 3);
    return {
      key,
      name: displayMap[key] || nm,
      gender: genderMap[key] || derived,
      impact: r2(beta[i]),
      se: r2(se),
      valueAdded: r2(beta[i] - meanBeta),
      apps: apps[i],
      winRate: apps[i] ? Math.round((wins[i] / apps[i]) * 100) : 0,
      bestFit: [],
      worstFit: null,
    };
  });

  const partnersOf = names.map(() => []);
  for (const k of Object.keys(pairs)) {
    const [i, j] = k.split("|").map(Number);
    const { shared, marginSum } = pairs[k];
    const observed = marginSum / shared;
    const mk = (self, mate) => {
      const raw = observed - (beta[self] + beta[mate]);
      const syn = raw * (shared / (shared + SYN_K));
      return {
        partner: players[mate].name,
        partnerBeta: r2(beta[mate]),
        synergy: r2(syn),
        shared,
        pairScore: r2(beta[self] + beta[mate] + syn),
      };
    };
    partnersOf[i].push(mk(i, j));
    partnersOf[j].push(mk(j, i));
  }
  players.forEach((p, i) => {
    const list = partnersOf[i];
    p.bestFit = list.slice().sort((a, b) => b.pairScore - a.pairScore).slice(0, MAX_PARTNERS);
    const w = list.slice().sort((a, b) => a.synergy - b.synergy)[0];
    p.worstFit = w ? { partner: w.partner, synergy: w.synergy, shared: w.shared } : null;
  });

  rankRoster(players); // global ranks
  const map = {};
  players.forEach((p) => (map[p.key] = p));
  const list = players.slice().sort((a, b) => b.impact - a.impact || b.apps - a.apps);
  return { list, map };
}

// Assign impactRank / winRateRank within a set of player objects (mutates).
function rankRoster(list) {
  list
    .slice()
    .sort((a, b) => b.impact - a.impact || b.apps - a.apps)
    .forEach((p, k) => (p.impactRank = k + 1));
  list
    .slice()
    .sort((a, b) => b.winRate - a.winRate || b.apps - a.apps)
    .forEach((p, k) => (p.winRateRank = k + 1));
}

// Club-specific appearances / wins for one venue's matches.
function venueStat(matches) {
  const apps = {};
  const wins = {};
  for (const m of matches) {
    const t1 = [norm(m.p1t1), norm(m.p2t1)];
    const t2 = [norm(m.p1t2), norm(m.p2t2)];
    const y = (m.scoreT1 || 0) - (m.scoreT2 || 0);
    for (const p of [...t1, ...t2]) apps[p] = (apps[p] || 0) + 1;
    for (const p of y > 0 ? t1 : t2) wins[p] = (wins[p] || 0) + 1;
  }
  return { apps, wins };
}

// Fetch everything and assemble venues + the global player list.
export async function loadLiveData() {
  const [venuesRes, playersRes] = await Promise.all([
    api("venues"),
    api("players").catch(() => ({ players: [] })),
  ]);

  const genderMap = {};
  const displayMap = {};
  for (const p of playersRes.players || []) {
    const k = (p.name || "").toLowerCase();
    if (!k) continue;
    genderMap[k] = (p.gender || "M").toUpperCase() === "F" ? "F" : "M";
    displayMap[k] = p.displayName || p.name;
  }

  const venueList = (venuesRes.venues || []).filter((v) => v && v.name);
  const rawByVenue = await Promise.all(
    venueList.map(async (meta) => {
      let matches = [];
      try {
        matches = decidedMatches(
          (await api(`venues/${encodeURIComponent(meta.name)}/matches`)).matches || []
        );
      } catch (e) {
        console.warn(`[Trekkr] matches for "${meta.name}" failed:`, e);
      }
      return { meta, matches };
    })
  );

  // One global model over every match, everywhere.
  const allMatches = rawByVenue.flatMap((v) => v.matches);
  const { list: gPlayers, map: gMap } = buildPlayers(
    ridgeModel(allMatches),
    genderMap,
    displayMap
  );

  const fallback = (name) => {
    const key = name.toLowerCase();
    return {
      key,
      name: displayMap[key] || name,
      gender: genderMap[key] || "M",
      impact: 0,
      se: 0.05,
      valueAdded: 0,
      apps: 0,
      winRate: 0,
      bestFit: [],
      worstFit: null,
    };
  };

  // Per venue: global analysis, but club-specific apps/win-rate and ranks.
  const venues = rawByVenue.map(({ meta, matches }) => {
    const { apps, wins } = venueStat(matches);
    const roster = Object.keys(apps).map((name) => {
      const g = gMap[name.toLowerCase()] || fallback(name);
      return {
        ...g,
        apps: apps[name],
        winRate: apps[name] ? Math.round(((wins[name] || 0) / apps[name]) * 100) : 0,
      };
    });
    rankRoster(roster); // ranks within this club
    roster.sort((a, b) => b.impact - a.impact || b.apps - a.apps);
    return {
      name: meta.name,
      region: meta.region || "",
      location: meta.location || "",
      count: roster.length,
      rows: matches.length,
      players: roster,
    };
  });

  // Home club (most matches) — used as the subtitle in "By players".
  const home = {};
  venues.forEach((v) =>
    v.players.forEach((p) => {
      if (!home[p.key] || p.apps > home[p.key].apps) home[p.key] = { venue: v.name, apps: p.apps };
    })
  );
  gPlayers.forEach((p) => (p.venue = (home[p.key] || {}).venue || ""));

  venues.sort((a, b) => b.rows - a.rows || b.count - a.count);
  return { venues, players: gPlayers };
}
