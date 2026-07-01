/**
 * TREKKR PADEL — Shared Data + Sync Layer (v3)
 * ------------------------------------------------------------
 * - Backward compatible with v2: spLoad/spSave, GL/GC/CC, t2s,
 *   computeStandings, getRoundLabel are unchanged so the existing
 *   public/TV displays keep working.
 * - Adds the Trekkr integration: read roster (name/photo/ELO) from
 *   the Google Sheet, compute ELO, build Upper/Lower split brackets,
 *   and queue match results to write back to the Sheet.
 *
 * CONFIG: set TREKKR.apiBase to your Vercel API (which proxies the
 * Apps Script web app). If left as '', the layer falls back to the
 * public gviz endpoint for read-only roster (ELO defaults to base).
 */

/* ============================================================
   CONFIG — talks to the real Trekkr API (trekkr.online/api).
   Same-origin '/api' when hosted on trekkr.online, else absolute
   (CORS is open on the API). No proxy/Apps Script needed.
   ============================================================ */
const TREKKR = {
  base: (typeof location !== 'undefined' && /(^|\.)trekkr\.online|(^|\.)turnamenpadel\.com$/i.test(location.hostname))
    ? '/api' : 'https://trekkr.online/api',
  elo: { base: 1350, k: 32, scale: 400, marginBonus: true },
};

const SP_KEY = 'stellar_padel_v2';            // shared tournament state (unchanged)
const TK_ROSTER_KEY = 'trekkr_roster_v1';     // cached player roster
const TK_QUEUE_KEY = 'trekkr_write_queue_v1'; // pending match writes
// reuse the official client's auth keys so a login on the main app carries over
const TK_TOKEN_KEY = 'trekkr_token';
const TK_ROLE_KEY = 'trekkr_role';
const TK_VENUE_KEY = 'trekkr_venue';
const TK_USER_KEY = 'trekkr_user';

/* ============================================================
   ORIGINAL HELPERS (unchanged — do not break v2 displays)
   ============================================================ */
const GL = ['A','B','C','D','E','F','G','H'];
const GC = {A:'#1e9fff',B:'#00c875',C:'#ff9955',D:'#cc55ff',E:'#ff6b6b',F:'#4ecdc4',G:'#ffe66d',H:'#a8e6cf'};
const CC = {1:'#1e9fff',2:'#00c875',3:'#ff9955',4:'#cc55ff',5:'#ff6b6b',6:'#4ecdc4'};

function spLoad() {
  try { const r = localStorage.getItem(SP_KEY); return r ? JSON.parse(r) : null; } catch(e) { return null; }
}
function spSave(d) { localStorage.setItem(SP_KEY, JSON.stringify(d)); }

function t2s(m) {
  const h = Math.floor(m/60)%24, mn = m%60;
  return (h<10?'0':'')+h+':'+(mn<10?'0':'')+mn;
}

function computeStandings(groups, sched, numGroups) {
  GL.slice(0,numGroups).forEach(g => {
    (groups[g]||[]).forEach(t => { t.W=0;t.L=0;t.GF=0;t.GA=0;t.pts=0; });
  });
  (sched||[]).forEach(m => {
    if(!m.done) return;
    const arr = groups[m.group];
    const hm = arr?.find(t=>t.name===m.home), aw = arr?.find(t=>t.name===m.away);
    if(!hm||!aw) return;
    const sv=parseInt(m.scoreHome)||0, sa=parseInt(m.scoreAway)||0;
    hm.GF+=sv; hm.GA+=sa; aw.GF+=sa; aw.GA+=sv;
    if(sv>sa){hm.W++;hm.pts++;aw.L++;}
    else if(sa>sv){aw.W++;aw.pts++;hm.L++;}
  });
  GL.slice(0,numGroups).forEach(g => {
    (groups[g]||[]).sort((a,b) => {
      if(b.pts!==a.pts) return b.pts-a.pts;
      const h2=(sched||[]).find(m=>m.done&&m.group===g&&((m.home===a.name&&m.away===b.name)||(m.home===b.name&&m.away===a.name)));
      if(h2){const aw=(h2.home===a.name&&parseInt(h2.scoreHome)>parseInt(h2.scoreAway))||(h2.away===a.name&&parseInt(h2.scoreAway)>parseInt(h2.scoreHome));return aw?-1:1;}
      return(b.GF-b.GA)-(a.GF-a.GA);
    });
  });
}

function getRoundLabel(r, tot) {
  const rv = tot-1-r;
  if(rv===0) return 'Final';
  if(rv===1) return 'Semi Final';
  if(rv===2) return 'Quarter Final';
  return 'Ronde '+(r+1);
}

/* ============================================================
   TREKKR API CORE + AUTH
   ============================================================ */
function tkToken() { try { return localStorage.getItem(TK_TOKEN_KEY) || ''; } catch(e){ return ''; } }
function tkSession() {
  try { return {
    token: tkToken(),
    role: localStorage.getItem(TK_ROLE_KEY) || '',
    venue: localStorage.getItem(TK_VENUE_KEY) || '',
    username: localStorage.getItem(TK_USER_KEY) || '',
  }; } catch(e){ return { token:'', role:'', venue:'', username:'' }; }
}
async function tkApi(path, options = {}) {
  const res = await fetch(`${TREKKR.base}/${path}`, {
    headers: { 'Content-Type': 'application/json', ...(tkToken() ? { Authorization: `Bearer ${tkToken()}` } : {}) },
    ...options,
  });
  let data = null; try { data = await res.json(); } catch(e){}
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}
async function tkLogin(username, password) {
  const data = await tkApi('auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  if (data && data.token) {
    try {
      localStorage.setItem(TK_TOKEN_KEY, data.token);
      localStorage.setItem(TK_ROLE_KEY, data.role || '');
      localStorage.setItem(TK_VENUE_KEY, data.venue || '');
      localStorage.setItem(TK_USER_KEY, data.username || username);
    } catch(e){}
  }
  return data;
}
function tkLogout() {
  [TK_TOKEN_KEY, TK_ROLE_KEY, TK_VENUE_KEY, TK_USER_KEY].forEach(k => { try { localStorage.removeItem(k); } catch(e){} });
}

/* ============================================================
   TREKKR ROSTER (name / photo / ELO from the live API)
   ============================================================ */
function tkNormPlayer(p) {
  return {
    name: (p.name || p.displayName || '').trim(),
    photo: (p.photoUrl || p.photo || '').trim(),
    elo: Math.round(parseFloat(p.elo ?? TREKKR.elo.base) || TREKKR.elo.base),
    gender: (p.gender || '').trim(),
    region: (p.region || '').trim(),
    club: (p.clubs || p.club || '').trim(),
    ig: (p.ig || '').trim(),
    verified: !!p.verified,
  };
}

// Load the full roster and join the latest ELO per player.
async function tkLoadRoster({ force = false } = {}) {
  if (!force) { const cached = tkCachedRoster(); if (cached && cached.length) return cached; }
  let roster = [];
  try {
    const [pRes, eRes] = await Promise.all([
      tkApi('players').catch(() => null),
      tkApi('elo/latest').catch(() => null),
    ]);
    const players = (pRes && pRes.players) || [];
    const eloMap = (eRes && eRes.players) || {};
    roster = players.map(p => {
      const np = tkNormPlayer(p);
      const e = eloMap[np.name];
      if (e && e.elo != null) np.elo = Math.round(e.elo);
      return np;
    }).filter(p => p.name);
    // fallback: if /players was empty, derive from leaderboard
    if (!roster.length) {
      const lb = await tkApi('elo/leaderboard').catch(() => null);
      roster = ((lb && lb.leaderboard) || []).map(tkNormPlayer).filter(p => p.name);
    }
  } catch (e) {
    roster = tkCachedRoster() || [];
  }
  if (roster.length) {
    roster.sort((a,b)=> b.elo - a.elo || a.name.localeCompare(b.name));
    try { localStorage.setItem(TK_ROSTER_KEY, JSON.stringify({ at: Date.now(), roster })); } catch(e){}
  }
  return roster;
}
function tkCachedRoster() {
  try { const r = JSON.parse(localStorage.getItem(TK_ROSTER_KEY)); return r?.roster || null; } catch(e){ return null; }
}
function tkFindPlayer(name) {
  const r = tkCachedRoster() || [];
  const key = (name||'').trim().toLowerCase();
  return r.find(p => p.name.toLowerCase() === key) || null;
}
// Trekkr tier from ELO (mirrors the official client).
function tkTier(elo){
  if(elo>=3000)return'Platinum'; if(elo>=2500)return'Gold'; if(elo>=2100)return'Silver';
  if(elo>=1800)return'Upper Bronze'; if(elo>=1500)return'Bronze'; if(elo>=1200)return'Lower Bronze';
  if(elo>=900)return'Upper Beginner'; return'Beginner';
}

/* ============================================================
   ELO (compatible with Trekkr: base 1350, 400-scale)
   ============================================================ */
function eloExpected(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / TREKKR.elo.scale));
}

// One doubles match -> deltas for all four players.
// teamA = [p1,p2] with .elo, scoreA/scoreB = games. Returns {name: delta}.
function eloMatchDeltas(teamA, teamB, scoreA, scoreB) {
  const ra = (teamA[0].elo + teamA[1].elo) / 2;
  const rb = (teamB[0].elo + teamB[1].elo) / 2;
  const ea = eloExpected(ra, rb);
  const sa = scoreA > scoreB ? 1 : scoreA < scoreB ? 0 : 0.5;
  let k = TREKKR.elo.k;
  if (TREKKR.elo.marginBonus) {
    const tot = (scoreA + scoreB) || 1;
    const margin = Math.abs(scoreA - scoreB) / tot;     // 0..1
    k = k * (1 + margin);                                // bigger blowout -> bigger swing
  }
  const dA = Math.round(k * (sa - ea));
  const out = {};
  out[teamA[0].name] = dA; out[teamA[1].name] = dA;
  out[teamB[0].name] = -dA; out[teamB[1].name] = -dA;
  return out;
}

/* ============================================================
   PAIR / TEAM helpers (fixed-pair tournament)
   A "team" object carries: {name, players:[{name,photo,elo}], elo}
   .name is the display label (e.g. "Donna & Sally").
   ============================================================ */
function tkTeamElo(team) {
  if (!team || !team.players || !team.players.length) return TREKKR.elo.base;
  return Math.round(team.players.reduce((s,p)=> s + (p.elo||TREKKR.elo.base), 0) / team.players.length);
}
function tkTeamLabel(players) {
  return players.map(p => (p.name||'').split(' ')[0]).join(' & ');
}

/* ============================================================
   GENERIC SINGLE-ELIM BRACKET (reused by playoff + split brackets)
   Input: ordered seed list [{team, group?, rank?, seed, players?, isBye?}]
   Output: {rounds, seeded, bracketSize, byes, thirdMatch}
   ============================================================ */
function tkBracketOrder(sz){
  if(sz===2)return[1,2];
  if(sz===4)return[1,4,2,3];
  if(sz===8)return[1,8,4,5,2,7,3,6];
  if(sz===16)return[1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11];
  return Array.from({length:sz},(_,i)=>i+1);
}

function tkPropagate(rounds){
  for(let r=0;r<rounds.length-1;r++){
    rounds[r].matches.forEach((m,i)=>{
      const nm=rounds[r+1].matches[Math.floor(i/2)];
      if(!nm||!m.winner)return;
      if(i%2===0)nm.teamA={...m.winner,fromMatch:m.id};
      else nm.teamB={...m.winner,fromMatch:m.id};
      if(nm.teamA.team!=='TBD'&&nm.teamB.team!=='TBD'&&!nm.done){
        if(nm.teamA.isBye){nm.winner=nm.teamB;nm.done=true;}
        else if(nm.teamB.isBye){nm.winner=nm.teamA;nm.done=true;}
      }
    });
  }
}

// Build a bracket from an ordered list of seeds. idPrefix keeps ids unique
// across multiple brackets (e.g. 'U' for upper, 'L' for lower).
function tkBuildBracket(seeded, idPrefix='r', withThird=true){
  const total=seeded.length;
  if(total<2) return {rounds:[],seeded,bracketSize:0,byes:0,thirdMatch:null};
  const bSz=Math.pow(2,Math.ceil(Math.log2(total))), byes=bSz-total;
  const rounds=[]; let rs=bSz; while(rs>=2){rounds.push({size:rs,matches:[]});rs/=2;}
  const order=tkBracketOrder(bSz);
  const slots=order.map(s=> s<=total ? seeded[s-1] : {team:'BYE',group:null,rank:0,seed:0,isBye:true});
  for(let i=0;i<bSz/2;i++){
    const a=slots[i*2],b=slots[i*2+1],isBye=a.isBye||b.isBye,aw=isBye?(a.isBye?b:a):null;
    rounds[0].matches.push({id:`${idPrefix}0m${i}`,round:0,pos:i,teamA:a,teamB:b,scoreA:null,scoreB:null,winner:aw,done:!!aw,isByeMatch:isBye});
  }
  for(let r=1;r<rounds.length;r++){
    for(let i=0;i<rounds[r].size/2;i++){
      rounds[r].matches.push({id:`${idPrefix}${r}m${i}`,round:r,pos:i,teamA:{team:'TBD',group:null,seed:0},teamB:{team:'TBD',group:null,seed:0},scoreA:null,scoreB:null,winner:null,done:false});
    }
  }
  tkPropagate(rounds);
  return {
    rounds, seeded, bracketSize:bSz, byes,
    thirdMatch: withThird ? {id:`${idPrefix}third`,isThird:true,teamA:{team:'TBD SF Loser',seed:0},teamB:{team:'TBD SF Loser',seed:0},scoreA:null,scoreB:null,winner:null,done:false} : null,
  };
}

/* SPLIT BRACKET: one combined ranking -> top half Upper, bottom half Lower.
   `ranked` is an ordered array of team objects (best first).
   Returns {upper, lower} each a bracket struct. */
function tkGenSplitBrackets(ranked){
  const n=ranked.length, half=Math.ceil(n/2);
  const top=ranked.slice(0,half), bottom=ranked.slice(half);
  const toSeed=(list)=> list.map((t,i)=>({team:t.name, players:t.players||[], elo:t.elo, group:t.group||null, rank:t.rank||null, seed:i+1}));
  return {
    upper: tkBuildBracket(toSeed(top),'U'),
    lower: tkBuildBracket(toSeed(bottom),'L'),
  };
}

// Flatten every group's standings into one overall ranking for the split.
// Tiebreak: points -> goal diff -> team ELO.
function tkOverallRanking(groups, numGroups){
  const all=[];
  GL.slice(0,numGroups).forEach(g=>(groups[g]||[]).forEach((t,i)=>all.push({...t, group:g, groupRank:i+1})));
  all.sort((a,b)=> (b.pts-a.pts) || ((b.GF-b.GA)-(a.GF-a.GA)) || ((b.elo||0)-(a.elo||0)));
  return all;
}

/* ============================================================
   WRITE-BACK QUEUE (record results via /api/venues/:venue/matches)
   ============================================================ */
// Build a match object in the API's shape (camelCase short keys).
function tkMatchPayload(teamA, teamB, scoreA, scoreB, meta = {}) {
  const pa = teamA.players || [], pb = teamB.players || [];
  return {
    week: meta.week || tkWeekLabel(meta.date),
    date: meta.date || new Date().toISOString().split('T')[0],
    p1t1: pa[0]?.name || '', p2t1: pa[1]?.name || '',
    p1t2: pb[0]?.name || '', p2t2: pb[1]?.name || '',
    scoreT1: parseInt(scoreA) || 0, scoreT2: parseInt(scoreB) || 0,
    gender: meta.gender || '',
    sourceUrl: meta.source || 'Trekkr Tournament',
  };
}
function tkWeekLabel(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - start) / 86400000) + start.getDay() + 1) / 7);
  return 'W' + week;
}
function tkQueueMatch(match, venue) {
  const q = tkQueue();
  q.push({ venue: venue || tkSession().venue || '', match, _queuedAt: Date.now(), _status: 'pending' });
  try { localStorage.setItem(TK_QUEUE_KEY, JSON.stringify(q)); } catch(e){}
  return q.length;
}
function tkQueue() { try { return JSON.parse(localStorage.getItem(TK_QUEUE_KEY)) || []; } catch(e){ return []; } }
function tkPendingCount() { return tkQueue().filter(r => r._status !== 'sent').length; }

// Flush: needs a token. Groups pending matches by venue and posts each batch.
async function tkFlushQueue() {
  const q = tkQueue();
  const pending = q.filter(r => r._status !== 'sent');
  if (!pending.length) return { sent: 0, failed: 0 };
  if (!tkToken()) return { sent: 0, failed: pending.length, needAuth: true };
  // group by venue
  const byVenue = {};
  pending.forEach(r => { const v = r.venue || tkSession().venue || ''; (byVenue[v] = byVenue[v] || []).push(r); });
  let sent = 0, failed = 0;
  for (const venue of Object.keys(byVenue)) {
    const batch = byVenue[venue];
    if (!venue) { failed += batch.length; continue; } // no venue -> cannot route
    try {
      await tkApi(`venues/${encodeURIComponent(venue)}/matches`, {
        method: 'POST',
        body: JSON.stringify({ matches: batch.map(r => r.match) }),
      });
      batch.forEach(r => { r._status = 'sent'; }); sent += batch.length;
    } catch (e) { failed += batch.length; }
  }
  try { localStorage.setItem(TK_QUEUE_KEY, JSON.stringify(q)); } catch(e){}
  return { sent, failed };
}

/* ============================================================
   ELO SESSION PUSH (writes ELO_Log via POST /api/sessions)
   The Trekkr API only writes ELO when it receives elo_results
   through saveSession — venues/:venue/matches stores match rows
   but does NOT touch ELO. So to "update ELO back to the Sheet"
   we compute deltas client-side (same formula as the Mexicano
   flow) and push one session summary.
   ============================================================ */
const TK_ELO_SENT_KEY = 'trekkr_elo_sent_v1';
function tkSentKeys(){ try { return JSON.parse(localStorage.getItem(TK_ELO_SENT_KEY)) || []; } catch(e){ return []; } }
function tkMarkSent(keys){
  const s = new Set(tkSentKeys()); keys.forEach(k=>s.add(k));
  try { localStorage.setItem(TK_ELO_SENT_KEY, JSON.stringify([...s])); } catch(e){}
}
function tkResetSent(){ try { localStorage.removeItem(TK_ELO_SENT_KEY); } catch(e){} }

// Collect every DONE, fully-rostered match (group RR + playoff incl. split)
// as an ordered list of {key, a:[p1,p2], b:[p1,p2], sa, sb, gender}.
function tkCollectCompletedMatches(groups, sched, playoff, numGroups){
  const out = [];
  const findTeam = (name) => {
    for (const g of GL.slice(0, numGroups)) { const t=(groups[g]||[]).find(x=>x.name===name); if(t) return t; }
    return null;
  };
  const genderOf = (pa,pb) => {
    const gs=[...pa,...pb].map(p=>p.gender).filter(Boolean);
    return gs.length && gs.every(g=>g===gs[0]) ? gs[0] : (gs[0]||'');
  };
  // group matches in schedule order
  (sched||[]).forEach(m=>{
    if(!m.done) return;
    const ta=findTeam(m.home), tb=findTeam(m.away);
    const pa=ta?.players||[], pb=tb?.players||[];
    if(pa.length<2||pb.length<2) return;
    out.push({ key:'g:'+m.id, a:pa, b:pb, sa:parseInt(m.scoreHome)||0, sb:parseInt(m.scoreAway)||0, gender:genderOf(pa,pb) });
  });
  // playoff matches (single bracket or split upper+lower) + thirds
  const brs = playoff ? (playoff.mode==='split' ? [playoff.upper,playoff.lower] : [playoff]) : [];
  brs.filter(Boolean).forEach(b=>{
    (b.rounds||[]).forEach(r=> r.matches.forEach(m=>{
      if(!m.done||m.isByeMatch) return;
      const pa=m.teamA?.players||[], pb=m.teamB?.players||[];
      if(pa.length<2||pb.length<2) return;
      out.push({ key:'p:'+m.id, a:pa, b:pb, sa:parseInt(m.scoreA)||0, sb:parseInt(m.scoreB)||0, gender:genderOf(pa,pb) });
    }));
    if(b.thirdMatch&&b.thirdMatch.done){
      const m=b.thirdMatch, pa=m.teamA?.players||[], pb=m.teamB?.players||[];
      if(pa.length>=2&&pb.length>=2) out.push({ key:'p:'+m.id, a:pa, b:pb, sa:parseInt(m.scoreA)||0, sb:parseInt(m.scoreB)||0, gender:genderOf(pa,pb) });
    }
  });
  return out;
}

// Build elo_results from an ordered match list, starting each player's ELO
// from baseEloByName (current Sheet ELO). Returns {results, finalElo}.
function tkBuildEloResults(matchList, baseEloByName){
  const cur = {}, w = {}, l = {}, base = {};
  const seed = (p) => { const n=p.name; if(cur[n]==null){ cur[n]=Math.round(baseEloByName[n] ?? p.elo ?? TREKKR.elo.base); base[n]=cur[n]; w[n]=0; l[n]=0; } };
  matchList.forEach(mt=>{
    [...mt.a,...mt.b].forEach(seed);
    const teamA=mt.a.map(p=>({name:p.name,elo:cur[p.name]}));
    const teamB=mt.b.map(p=>({name:p.name,elo:cur[p.name]}));
    const d=eloMatchDeltas(teamA,teamB,mt.sa,mt.sb);
    Object.keys(d).forEach(n=>{ cur[n]+=d[n]; });
    const aWin=mt.sa>mt.sb, bWin=mt.sb>mt.sa;
    mt.a.forEach(p=>{ if(aWin)w[p.name]++; else if(bWin)l[p.name]++; });
    mt.b.forEach(p=>{ if(bWin)w[p.name]++; else if(aWin)l[p.name]++; });
  });
  const results = Object.keys(cur).map(n=>({ player:n, new_elo:cur[n], elo_change:cur[n]-base[n], w:w[n], l:l[n] }));
  return { results, finalElo: cur };
}

// Push ELO for all not-yet-sent completed matches. Updates the cached roster
// ELO and the sent-keys set on success. Returns {ok, sent, sessionId, skipped}.
async function tkPushElo(groups, sched, playoff, numGroups, meta={}){
  if(!tkToken()) return { ok:false, needAuth:true };
  const all = tkCollectCompletedMatches(groups, sched, playoff, numGroups);
  const sent = new Set(tkSentKeys());
  const fresh = all.filter(m=>!sent.has(m.key));
  if(!fresh.length) return { ok:true, sent:0, nothing:true };
  // base ELO from cached roster (reflects the Sheet)
  const roster = tkCachedRoster() || [];
  const baseElo = {}; roster.forEach(p=> baseElo[p.name]=p.elo);
  const { results, finalElo } = tkBuildEloResults(fresh, baseElo);
  const venue = meta.venue || tkSession().venue || '';
  const body = {
    sessionName: meta.sessionName || ('Trekkr Tournament' + (meta.name?(' — '+meta.name):'')),
    venue, sourceUrl: meta.source || 'Trekkr Tournament',
    matchCount: fresh.length, playerCount: results.length,
    players: results.map(r=>r.player), elo_results: results,
  };
  try {
    const res = await tkApi('sessions', { method:'POST', body: JSON.stringify(body) });
    tkMarkSent(fresh.map(m=>m.key));
    // reflect new ELO locally so subsequent pushes/preview use updated values
    if(roster.length){
      roster.forEach(p=>{ if(finalElo[p.name]!=null) p.elo=finalElo[p.name]; });
      try { localStorage.setItem(TK_ROSTER_KEY, JSON.stringify({ at: Date.now(), roster })); } catch(e){}
    }
    return { ok:true, sent:fresh.length, sessionId:res?.sessionId, results };
  } catch(e){
    return { ok:false, error:e.message };
  }
}
