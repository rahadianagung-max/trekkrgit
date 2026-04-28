/**
 * TREKKR TOURNEY — Shared Data Layer
 * Terintegrasi dengan Trekkr API (https://trekkr.online/api)
 * Data disimpan di localStorage dengan key unik per venue + tournamen
 * agar aman dipakai beberapa venue sekaligus.
 */

const API_BASE = 'https://trekkr.online/api';
const GL = ['A','B','C','D','E','F','G','H'];
const GC = {A:'#1e9fff',B:'#00c875',C:'#ff9955',D:'#cc55ff',E:'#ff6b6b',F:'#4ecdc4',G:'#ffe66d',H:'#a8e6cf'};
const CC = {1:'#1e9fff',2:'#00c875',3:'#ff9955',4:'#cc55ff',5:'#ff6b6b',6:'#4ecdc4'};

// ── Storage key per venue ──────────────────────────────────────────────────
function getStorageKey(venue) {
  return `trekkr_tourney_${(venue||'default').replace(/\s+/g,'_').toLowerCase()}`;
}

function spLoad(venue) {
  try {
    const key = getStorageKey(venue);
    const r = localStorage.getItem(key);
    return r ? JSON.parse(r) : null;
  } catch(e) { return null; }
}

function spSave(d, venue) {
  const key = getStorageKey(venue);
  localStorage.setItem(key, JSON.stringify(d));
}

// ── API helpers ────────────────────────────────────────────────────────────
async function apiRequest(path, options = {}, token = '') {
  const url = `${API_BASE}/${path}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  };
  const res = await fetch(url, config);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function fetchTrekkrPlayers(token) {
  const [pRes, eRes] = await Promise.all([
    apiRequest('players', {}, token),
    apiRequest('elo/latest', {}, token),
  ]);
  const eloMap = eRes.players || {};
  return (pRes.players || []).map(p => ({
    name: p.name,
    displayName: p.displayName || p.name,
    gender: p.gender || 'M',
    elo: eloMap[p.name]?.elo || 1350,
    matchCount: (eloMap[p.name]?.w || 0) + (eloMap[p.name]?.l || 0),
  }));
}

async function submitMatchesToTrekkr(matches, venue, token) {
  if (!venue || !token) return;
  try {
    await apiRequest(`venues/${encodeURIComponent(venue)}/matches`, {
      method: 'POST',
      body: JSON.stringify({ matches }),
    }, token);
  } catch(e) { console.warn('Trekkr submit warn:', e.message); }
}

async function addNewPlayer(name, gender, token) {
  return apiRequest('players', {
    method: 'POST',
    body: JSON.stringify({ name, gender: gender.toUpperCase() }),
  }, token);
}

// ── ELO Engine (mirrors trekkr backend) ───────────────────────────────────
function getKFactor(n) { return n < 10 ? 40 : n < 30 ? 32 : n < 60 ? 24 : 20; }
function calcExpected(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }

function calcMatchElo(p1t1, p2t1, p1t2, p2t2, s1, s2) {
  const t1Avg = (p1t1.elo + p2t1.elo) / 2;
  const t2Avg = (p1t2.elo + p2t2.elo) / 2;
  const t1R = s1 > s2 ? 1 : s1 < s2 ? 0 : 0.5;
  const t2R = 1 - t1R;
  const margin = 1 + Math.min(Math.abs(s1 - s2) * 0.04, 0.3);
  const exp1 = calcExpected(t1Avg, t2Avg);
  const upd = (p, result, exp) => {
    const k = getKFactor(p.matchCount || 0) * margin;
    return { name: p.name, newElo: Math.round(p.elo + k * (result - exp)) };
  };
  return [upd(p1t1,t1R,exp1), upd(p2t1,t1R,exp1), upd(p1t2,t2R,1-exp1), upd(p2t2,t2R,1-exp1)];
}

function getTierName(elo) {
  if (elo >= 3000) return 'Platinum';
  if (elo >= 2500) return 'Gold';
  if (elo >= 2100) return 'Silver';
  if (elo >= 1800) return 'Upper Bronze';
  if (elo >= 1500) return 'Bronze';
  if (elo >= 1200) return 'Lower Bronze';
  if (elo >= 900)  return 'Upper Beginner';
  return 'Beginner';
}

// ── Standings ──────────────────────────────────────────────────────────────
function computeStandings(groups, sched, numGroups) {
  GL.slice(0, numGroups).forEach(g => {
    (groups[g] || []).forEach(t => { t.W=0; t.L=0; t.GF=0; t.GA=0; t.pts=0; });
  });
  (sched || []).forEach(m => {
    if (!m.done) return;
    const arr = groups[m.group];
    const hm = arr?.find(t => t.name === m.home);
    const aw = arr?.find(t => t.name === m.away);
    if (!hm || !aw) return;
    const sv = parseInt(m.scoreHome) || 0, sa = parseInt(m.scoreAway) || 0;
    hm.GF += sv; hm.GA += sa; aw.GF += sa; aw.GA += sv;
    if (sv > sa)      { hm.W++; hm.pts++; aw.L++; }
    else if (sa > sv) { aw.W++; aw.pts++; hm.L++; }
  });
  GL.slice(0, numGroups).forEach(g => {
    (groups[g] || []).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const h2 = (sched || []).find(m =>
        m.done && m.group === g &&
        ((m.home===a.name&&m.away===b.name)||(m.home===b.name&&m.away===a.name))
      );
      if (h2) {
        const aw = (h2.home===a.name && parseInt(h2.scoreHome)>parseInt(h2.scoreAway)) ||
                   (h2.away===a.name && parseInt(h2.scoreAway)>parseInt(h2.scoreHome));
        return aw ? -1 : 1;
      }
      return (b.GF - b.GA) - (a.GF - a.GA);
    });
  });
}

function getRoundLabel(r, tot) {
  const rv = tot - 1 - r;
  if (rv === 0) return 'Final';
  if (rv === 1) return 'Semi Final';
  if (rv === 2) return 'Quarter Final';
  return 'Ronde ' + (r + 1);
}

function t2s(m) {
  const h = Math.floor(m / 60) % 24, mn = m % 60;
  return (h<10?'0':'')+h+':'+(mn<10?'0':'')+mn;
}
