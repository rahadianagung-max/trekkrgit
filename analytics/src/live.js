/* live.js — Trekkr Sabermetrics live data layer.
 *
 * Replaces the frozen `data.js` snapshot. Instead of a hard-coded list of
 * venues/players, this fetches the real Trekkr data at page load and computes
 * the same sabermetrics shape the UI expects, so any NEW venue or player shows
 * up in the club dropdown automatically — no rebuild required.
 *
 * Output shape (per venue), identical to the old snapshot:
 *   { name, region, location, count, rows, players: [
 *       { name, gender, impact, se, winRate, apps, valueAdded,
 *         impactRank, winRateRank,
 *         bestFit: [ { partner, pairScore, partnerBeta, synergy, shared } ],
 *         worstFit: { partner, synergy, shared } } ] }
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

// Solve (A x = b) and return diag(A^{-1}) too, via Gauss-Jordan on [A | I | b].
// A is small and, thanks to ridge, well-conditioned.
function solveWithInverseDiag(A, b) {
  const n = A.length;
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

// Compute one venue's roster + sabermetrics from its raw match rows.
function computeVenue(meta, rawMatches, genderMap, displayMap) {
  const norm = (s) => (s || "").trim();

  // Keep only decided 2-v-2 matches with four named players.
  const matches = (rawMatches || []).filter((m) => {
    const ps = [m.p1t1, m.p2t1, m.p1t2, m.p2t2].map(norm);
    if (ps.some((p) => !p)) return false;
    return (m.scoreT1 || 0) !== (m.scoreT2 || 0);
  });

  // Index the roster.
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

  const emptyVenue = {
    name: meta.name,
    region: meta.region || "",
    location: meta.location || "",
    count: n,
    rows: matches.length,
    players: [],
  };
  if (n === 0) return emptyVenue;

  // Accumulate ridge normal equations A = XᵀX + λI, rhs = Xᵀy, plus per-player
  // record and per-pair (teammate) aggregates.
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
    let y = (m.scoreT1 || 0) - (m.scoreT2 || 0); // team-1 point differential
    y = clamp(y, -MARGIN_CAP, MARGIN_CAP);
    const t1Win = y > 0;

    // record + gender votes
    const g = (m.gender || "").toUpperCase() === "F" ? "F" : "M";
    for (const p of [...t1, ...t2]) {
      apps[p]++;
      genderVotes[p][g] = (genderVotes[p][g] || 0) + 1;
    }
    if (t1Win) t1.forEach((p) => wins[p]++);
    else t2.forEach((p) => wins[p]++);

    // ridge normal-equation contributions (row has +1 for t1, -1 for t2)
    for (const p of t1) {
      A[p][p] += 1;
      rhs[p] += y;
    }
    for (const p of t2) {
      A[p][p] += 1;
      rhs[p] -= y;
    }
    A[a][b] += 1;
    A[b][a] += 1; // same-team +1
    A[c][d] += 1;
    A[d][c] += 1;
    for (const p of t1)
      for (const q of t2) {
        A[p][q] -= 1;
        A[q][p] -= 1;
      } // cross-team -1

    // teammate pairs, from each pair's own perspective
    addPair(a, b, y);
    addPair(c, d, -y);
  }
  for (let i = 0; i < n; i++) A[i][i] += RIDGE;

  const { x: beta, invDiag } = solveWithInverseDiag(A, rhs);

  // residual variance for the ± confidence figure
  let ssr = 0;
  for (const m of matches) {
    let y = (m.scoreT1 || 0) - (m.scoreT2 || 0);
    y = clamp(y, -MARGIN_CAP, MARGIN_CAP);
    const pred =
      beta[idx[norm(m.p1t1)]] +
      beta[idx[norm(m.p2t1)]] -
      beta[idx[norm(m.p1t2)]] -
      beta[idx[norm(m.p2t2)]];
    ssr += (y - pred) ** 2;
  }
  const sigma2 = ssr / Math.max(1, matches.length);
  const meanBeta = beta.reduce((s, v) => s + v, 0) / n;

  // Build player objects.
  const players = names.map((nm, i) => {
    const key = nm.toLowerCase();
    const votes = genderVotes[i];
    const derivedGender = (votes.F || 0) > (votes.M || 0) ? "F" : "M";
    const se = clamp(Math.sqrt(Math.max(0, sigma2 * invDiag[i])), 0.05, 3);
    return {
      _i: i,
      name: displayMap[key] || nm,
      gender: genderMap[key] || derivedGender,
      impact: r2(beta[i]),
      se: r2(se),
      winRate: apps[i] ? Math.round((wins[i] / apps[i]) * 100) : 0,
      apps: apps[i],
      valueAdded: r2(beta[i] - meanBeta),
      bestFit: [],
      worstFit: null,
    };
  });

  // Partner analysis: for each player, walk the teammates they actually shared
  // a court with.
  const partnersOf = names.map(() => []);
  for (const key of Object.keys(pairs)) {
    const [i, j] = key.split("|").map(Number);
    const { shared, marginSum } = pairs[key];
    const observed = marginSum / shared;
    const build = (self, mate) => {
      const rawSyn = observed - (beta[self] + beta[mate]);
      const syn = rawSyn * (shared / (shared + SYN_K));
      return {
        partner: players[mate].name,
        partnerBeta: r2(beta[mate]),
        synergy: r2(syn),
        shared,
        pairScore: r2(beta[self] + beta[mate] + syn),
      };
    };
    partnersOf[i].push(build(i, j));
    partnersOf[j].push(build(j, i));
  }
  players.forEach((p) => {
    const list = partnersOf[p._i];
    p.bestFit = list
      .slice()
      .sort((a, b) => b.pairScore - a.pairScore)
      .slice(0, MAX_PARTNERS);
    const worst = list
      .slice()
      .sort((a, b) => a.synergy - b.synergy)[0];
    p.worstFit = worst
      ? { partner: worst.partner, synergy: worst.synergy, shared: worst.shared }
      : null;
    delete p._i;
  });

  // Ranks within the venue.
  const byImpact = players.slice().sort((a, b) => b.impact - a.impact || b.apps - a.apps);
  byImpact.forEach((p, k) => (p.impactRank = k + 1));
  const byWin = players.slice().sort((a, b) => b.winRate - a.winRate || b.apps - a.apps);
  byWin.forEach((p, k) => (p.winRateRank = k + 1));

  // Present roster ranked by impact (what RosterView shows).
  return { ...emptyVenue, count: n, players: byImpact };
}

// Fetch everything and assemble the venues array the app renders.
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
  const venues = await Promise.all(
    venueList.map(async (meta) => {
      let matches = [];
      try {
        matches =
          (await api(`venues/${encodeURIComponent(meta.name)}/matches`)).matches || [];
      } catch (e) {
        console.warn(`[Trekkr] matches for "${meta.name}" failed:`, e);
      }
      return computeVenue(meta, matches, genderMap, displayMap);
    })
  );

  // Busiest clubs first, so the default selection has data.
  venues.sort((a, b) => b.rows - a.rows || b.count - a.count);
  return venues;
}
