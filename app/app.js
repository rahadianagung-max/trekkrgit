/* Trekkr Player PWA — app shell: auth, router, screens. Vanilla JS, no build. */
(function (w, d) {
  "use strict";
  var API = w.TrekkrAPI, sb = API.sb;
  var app = d.getElementById("app");
  var docEl = d.documentElement;

  /* ---------- theme (dark / light toggle, persisted) ---------- */
  try { var _th = localStorage.getItem("trekkr_theme"); if (_th === "light" || _th === "dark") docEl.setAttribute("data-theme", _th); } catch (e) {}
  function effectiveTheme() {
    var t = docEl.getAttribute("data-theme");
    if (t === "light" || t === "dark") return t;
    return (w.matchMedia && w.matchMedia("(prefers-color-scheme:dark)").matches) ? "dark" : "light";
  }
  function applyTheme(t) {
    if (t === "light" || t === "dark") { docEl.setAttribute("data-theme", t); try { localStorage.setItem("trekkr_theme", t); } catch (e) {} }
    else { docEl.removeAttribute("data-theme"); try { localStorage.removeItem("trekkr_theme"); } catch (e) {} }
  }
  // Live-restyle via CSS vars — no re-render needed; just refresh the toggle glyphs.
  function toggleTheme() {
    applyTheme(effectiveTheme() === "dark" ? "light" : "dark");
    var g = effectiveTheme() === "dark" ? "☀️" : "🌙";
    Array.prototype.forEach.call(d.querySelectorAll(".themebtn"), function (b) { b.textContent = g; });
  }
  function themeBtnHTML(id) { return '<button class="themebtn" id="' + id + '" aria-label="Toggle dark / light mode">' + (effectiveTheme() === "dark" ? "☀️" : "🌙") + '</button>'; }
  function wireThemeBtn(id) { var b = d.getElementById(id); if (b) b.onclick = toggleTheme; }

  var S = {
    session: null,
    token: null,
    cut: null,          // tier cutoffs {t1,t2}
    me: null,           // account/me result
    myName: "",         // canonical linked player name
    view: "passport",   // passport | rankings | main | profil | ranked-info
    prev: null,
    rankFilter: "all",
    card: null,         // data for the shareable night card
    playerView: "",     // name for the mini-profile view
  };

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function initials(n) { return (String(n || "").trim().split(/\s+/).map(function (x) { return x[0] || ""; }).slice(0, 2).join("") || "?").toUpperCase(); }
  function normName(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }
  function firstName(n) { return String(n || "").trim().split(/\s+/)[0] || ""; }
  function fmtDate(ts) { var x = new Date(ts); return isNaN(x) ? "—" : x.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
  function slug(n) { return String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function norm(n) { return String(n || "").trim().toLowerCase(); }
  // Placeholder names used for walkovers / byes — never real players.
  function isWalkout(n) { var s = String(n || "").toLowerCase().replace(/[^a-z]/g, ""); return s === "walkout" || s === "walkover" || s === "wo" || s === "bye"; }
  function setHTML(html) { app.innerHTML = html; }
  function toast(msg) {
    var t = d.createElement("div"); t.className = "toast"; t.textContent = msg; d.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 250); }, 1900);
  }
  // Best-performing partner from raw matches: pick the teammate with the best
  // win record together (min 2 matches). meNames = [canonical, displayName].
  function bestPartner(matches, meNames) {
    var mine = (meNames || []).map(norm).filter(Boolean);
    function isMe(n) { return mine.indexOf(norm(n)) !== -1; }
    var tally = {};
    (matches || []).forEach(function (m) {
      var t1 = [m.p1t1, m.p2t1], t2 = [m.p1t2, m.p2t2];
      var inT1 = t1.some(isMe), inT2 = t2.some(isMe);
      var team = inT1 ? t1 : (inT2 ? t2 : null); if (!team) return;
      var won = inT1 ? (m.scoreT1 > m.scoreT2) : (m.scoreT2 > m.scoreT1);
      var partner = team.filter(function (n) { return n && !isMe(n); })[0]; if (!partner) return;
      var k = norm(partner); if (!tally[k]) tally[k] = { name: partner, w: 0, l: 0 };
      if (won) tally[k].w++; else tally[k].l++;
    });
    var arr = Object.keys(tally).map(function (k) { return tally[k]; }).filter(function (p) { return (p.w + p.l) >= 2; });
    arr.sort(function (a, b) { return (b.w - b.l) - (a.w - a.l) || b.w - a.w; });
    return arr[0] || null;
  }
  // Per-match results (newest first) from raw venue matches. meNames = [canonical, display].
  function matchResults(matches, meNames) {
    var mine = (meNames || []).map(norm).filter(Boolean);
    function isMe(n) { return mine.indexOf(norm(n)) !== -1; }
    var out = [];
    (matches || []).forEach(function (m) {
      var t1 = [m.p1t1, m.p2t1], t2 = [m.p1t2, m.p2t2];
      var inT1 = t1.some(isMe), inT2 = t2.some(isMe); if (!inT1 && !inT2) return;
      var team = inT1 ? t1 : t2, opp = inT1 ? t2 : t1;
      var sf = inT1 ? m.scoreT1 : m.scoreT2, sa = inT1 ? m.scoreT2 : m.scoreT1;
      var res = (sf === sa) ? "D" : (sf > sa ? "W" : "L");
      var partner = team.filter(function (n) { return n && !isMe(n); })[0] || "";
      var opps = opp.filter(Boolean).join(" & ");
      var ts = Date.parse(m.date); if (isNaN(ts)) ts = 0;
      out.push({ res: res, sf: sf, sa: sa, pd: sf - sa, partner: partner, opps: opps, venue: m.venue || "", date: m.date || "", ts: ts });
    });
    out.sort(function (a, b) { return b.ts - a.ts; });
    return out;
  }
  // Minimal ELO sparkline (last N points) as inline SVG, orange line + fade.
  function sparkline(hist) {
    var pts = (hist || []).slice(-24).map(function (h) { return h.elo; }).filter(function (v) { return v != null; });
    if (pts.length < 2) return "";
    var W = 320, H = 66, pad = 6, min = Math.min.apply(null, pts), max = Math.max.apply(null, pts), rng = (max - min) || 1;
    var step = (W - pad * 2) / (pts.length - 1);
    var co = pts.map(function (v, i) { return [pad + i * step, pad + (H - pad * 2) * (1 - (v - min) / rng)]; });
    var line = co.map(function (c, i) { return (i ? "L" : "M") + c[0].toFixed(1) + " " + c[1].toFixed(1); }).join(" ");
    var area = line + " L" + co[co.length - 1][0].toFixed(1) + " " + (H - pad) + " L" + co[0][0].toFixed(1) + " " + (H - pad) + " Z";
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--or)" stop-opacity=".35"/><stop offset="1" stop-color="var(--or)" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#sg)"/>' +
      '<path d="' + line + '" fill="none" stroke="var(--or)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  /* ---------- achievement badges (ported from the web passport) ---------- */
  var BADGE_DEFS = [
    { id: "giant_slayer", cat: "Combat", emoji: "⚔️", name: "Giant Slayer", rarity: "uncommon", criteria: "Beat a team averaging 200+ ELO above yours.", compute: function (d) { return d.matchesRaw.some(function (m) { return m._myWin && ((m._oppElo1 + m._oppElo2) / 2 - (m._myElo1 + m._myElo2) / 2) >= 200; }); } },
    { id: "dragon_slayer", cat: "Combat", emoji: "🐉", name: "Dragon Slayer", rarity: "rare", criteria: "Beat a team averaging 400+ ELO above yours.", compute: function (d) { return d.matchesRaw.some(function (m) { return m._myWin && ((m._oppElo1 + m._oppElo2) / 2 - (m._myElo1 + m._myElo2) / 2) >= 400; }); } },
    { id: "flawless", cat: "Combat", emoji: "🎯", name: "Flawless", rarity: "uncommon", criteria: "Win a match with the opponent on 0.", compute: function (d) { return d.matchesRaw.some(function (m) { return m._myWin && m._oppScore === 0; }); } },
    { id: "unstoppable", cat: "Combat", emoji: "🔥", name: "Unstoppable", rarity: "rare", criteria: "Win 5 matches in a row.", progress: function (d) { return { val: d.bestStreak, max: 5 }; }, compute: function (d) { return d.bestStreak >= 5; } },
    { id: "iron_wall", cat: "Combat", emoji: "🛡️", name: "Iron Wall", rarity: "uncommon", criteria: "Win holding opponents to 2 or fewer.", compute: function (d) { return d.matchesRaw.some(function (m) { return m._myWin && m._oppScore <= 2; }); } },
    { id: "summit", cat: "Journey", emoji: "🏔️", name: "Summit", rarity: "common", criteria: "Reach a new personal-best ELO.", compute: function (d) { return d.history.length && d.stats.currentElo === Math.max.apply(null, d.history.map(function (h) { return h.elo || 0; }).concat([d.stats.currentElo])); } },
    { id: "on_the_rise", cat: "Journey", emoji: "📈", name: "On The Rise", rarity: "uncommon", criteria: "Gain 150+ ELO in the last 30 days.", progress: function (d) { return { val: Math.max(0, d.eloGain30d), max: 150 }; }, compute: function (d) { return d.eloGain30d >= 150; } },
    { id: "fast_track", cat: "Journey", emoji: "⚡", name: "Fast Track", rarity: "rare", criteria: "Gain 200+ ELO in your first 20 matches.", compute: function (d) { if (d.stats.totalMatches < 20) return false; var f = d.history.slice(0, 20); return f.length >= 2 && (f[f.length - 1].elo - f[0].elo) >= 200; } },
    { id: "veteran", cat: "Consistency", emoji: "🎖️", name: "Veteran", rarity: "uncommon", criteria: "Play 100 recorded matches.", progress: function (d) { return { val: d.stats.totalMatches, max: 100 }; }, compute: function (d) { return d.stats.totalMatches >= 100; } },
    { id: "legend", cat: "Consistency", emoji: "🏛️", name: "Legend", rarity: "epic", criteria: "Play 500 recorded matches.", progress: function (d) { return { val: d.stats.totalMatches, max: 500 }; }, compute: function (d) { return d.stats.totalMatches >= 500; } },
    { id: "nomad", cat: "Consistency", emoji: "🌍", name: "Nomad", rarity: "uncommon", criteria: "Play at 3+ different venues.", progress: function (d) { return { val: d.venueCount, max: 3 }; }, compute: function (d) { return d.venueCount >= 3; } },
    { id: "all_rounder", cat: "Consistency", emoji: "🎭", name: "All-Rounder", rarity: "uncommon", criteria: "Play with 10+ different partners.", progress: function (d) { return { val: Object.keys(d.partnerStats).length, max: 10 }; }, compute: function (d) { return Object.keys(d.partnerStats).length >= 10; } },
    { id: "dynamic_duo", cat: "Partnership", emoji: "🤜", name: "Dynamic Duo", rarity: "uncommon", criteria: "80%+ win rate with a partner (10+ together).", compute: function (d) { return Object.keys(d.partnerStats).some(function (k) { var p = d.partnerStats[k]; return p.total >= 10 && p.w / p.total >= 0.8; }); } },
    { id: "team_player", cat: "Partnership", emoji: "🧩", name: "Team Player", rarity: "rare", criteria: "60%+ win rate with 5 partners (5+ each).", compute: function (d) { return Object.keys(d.partnerStats).filter(function (k) { var p = d.partnerStats[k]; return p.total >= 5 && p.w / p.total >= 0.6; }).length >= 5; } },
    { id: "versatile", cat: "Partnership", emoji: "🎪", name: "Versatile", rarity: "uncommon", criteria: "Win with 5 different partners.", progress: function (d) { return { val: Object.keys(d.partnerStats).filter(function (k) { return d.partnerStats[k].w >= 1; }).length, max: 5 }; }, compute: function (d) { return Object.keys(d.partnerStats).filter(function (k) { return d.partnerStats[k].w >= 1; }).length >= 5; } },
    { id: "king_killer", cat: "Special", emoji: "👑", name: "King Killer", rarity: "epic", criteria: "Beat a Silver+ (2100+) opponent team.", compute: function (d) { return d.matchesRaw.some(function (m) { return m._myWin && (m._oppElo1 + m._oppElo2) / 2 >= 2100; }); } },
  ];
  function computeBadges(playerD, matches, eloMap) {
    var s = playerD.stats, history = playerD.history || [];
    var mine = [playerD.player.name, playerD.player.displayName].map(function (x) { return String(x || "").toLowerCase().trim(); }).filter(Boolean);
    function isMe(n) { return mine.indexOf(String(n || "").toLowerCase().trim()) !== -1; }
    function getElo(n) { return (eloMap && eloMap[String(n || "").toLowerCase().trim()]) || 1350; }
    var matchesRaw = (matches || []).map(function (m) {
      var myT1 = isMe(m.p1t1) || isMe(m.p2t1);
      var myScore = myT1 ? (m.scoreT1 || 0) : (m.scoreT2 || 0), oppScore = myT1 ? (m.scoreT2 || 0) : (m.scoreT1 || 0);
      return { p1t1: m.p1t1, p2t1: m.p2t1, p1t2: m.p1t2, p2t2: m.p2t2, venue: m.venue, _myWin: myScore > oppScore, _oppScore: oppScore,
        _myElo1: getElo(myT1 ? m.p1t1 : m.p1t2), _myElo2: getElo(myT1 ? m.p2t1 : m.p2t2), _oppElo1: getElo(myT1 ? m.p1t2 : m.p1t1), _oppElo2: getElo(myT1 ? m.p2t2 : m.p2t1) };
    });
    var partnerStats = {};
    matchesRaw.forEach(function (m) {
      var myT1 = isMe(m.p1t1) || isMe(m.p2t1);
      var partner = myT1 ? (isMe(m.p1t1) ? m.p2t1 : m.p1t1) : (isMe(m.p1t2) ? m.p2t2 : m.p1t2);
      if (!partner || isMe(partner)) return;
      var pk = partner.toLowerCase().trim();
      if (!partnerStats[pk]) partnerStats[pk] = { name: partner, w: 0, l: 0, total: 0 };
      partnerStats[pk].total++; if (m._myWin) partnerStats[pk].w++; else partnerStats[pk].l++;
    });
    var bestStreak = 0, cur = 0;
    matchesRaw.forEach(function (m) { if (m._myWin) { cur++; bestStreak = Math.max(bestStreak, cur); } else cur = 0; });
    var venueCount = (new Set(matchesRaw.map(function (m) { return m.venue || "default"; }))).size;
    var now = Date.now(), recent = history.filter(function (h) { return h.date && (now - Date.parse(h.date)) <= 2592000000; });
    var eloGain30d = recent.length >= 2 ? recent[recent.length - 1].elo - recent[0].elo : (history.length >= 2 ? history[history.length - 1].elo - history[0].elo : 0);
    var ctx = { stats: s, history: history, matchesRaw: matchesRaw, partnerStats: partnerStats, bestStreak: bestStreak, venueCount: venueCount, eloGain30d: eloGain30d };
    var calibrating = (s.totalMatches || 0) < 15;
    return BADGE_DEFS.map(function (def) {
      var earned = false; if (!calibrating) { try { earned = !!def.compute(ctx); } catch (e) {} }
      var prog = null; if (!earned && def.progress) { try { prog = def.progress(ctx); } catch (e) {} }
      return { def: def, earned: earned, progress: prog };
    });
  }
  function showBadge(b) {
    var def = b.def;
    var st = b.earned ? "Earned" : (b.progress ? b.progress.val + " / " + b.progress.max : "Locked");
    var old = d.querySelector(".bsheet-wrap"); if (old) old.remove();
    var el = d.createElement("div"); el.className = "bsheet-wrap";
    el.innerHTML = '<div class="bsheet"><button class="x" aria-label="Close">×</button>' +
      '<div class="bs-emoji' + (b.earned ? "" : " lock") + '">' + def.emoji + '</div>' +
      '<div class="bs-name">' + esc(def.name) + '</div>' +
      '<div class="bs-status ' + (b.earned ? "ok" : "") + '">' + esc(st) + '</div>' +
      '<p class="bs-crit">' + esc(def.criteria) + '</p></div>';
    d.body.appendChild(el);
    function close() { el.remove(); }
    el.onclick = function (e) { if (e.target === el) close(); };
    el.querySelector(".x").onclick = close;
  }
  // Calibrated status check: blue = calibrated, grey = still calibrating.
  function checkBadge(on) {
    var c = on ? "#1D9BF0" : "var(--faint)";
    return '<svg class="chk" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="' + c + '"/><path d="M7.5 12.4l3 3 6-6.4" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function rowAvatar(photo, nm) {
    return '<span class="rav">' + (photo ? '<img src="' + esc(photo) + '" alt=""/>' : esc(initials(nm))) + '</span>';
  }
  function isIosSafari() {
    var ua = w.navigator.userAgent;
    var ios = /iPad|iPhone|iPod/.test(ua) && !w.MSStream;
    var standalone = w.navigator.standalone === true || w.matchMedia("(display-mode: standalone)").matches;
    return ios && !standalone;
  }

  /* ---------- install prompt (Android / desktop Chrome) ---------- */
  var deferredInstall = null;
  w.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferredInstall = e; showInstallBar();
  });
  w.addEventListener("appinstalled", function () {
    deferredInstall = null;
    var b = d.querySelector(".installbar"); if (b) b.remove();
  });
  function showInstallBar() {
    if (!deferredInstall || d.querySelector(".installbar")) return;
    try { if (localStorage.getItem("trekkr_installbar") === "off") return; } catch (e) {}
    var el = d.createElement("div");
    el.className = "ioshint installbar";
    el.innerHTML = '<button class="x" aria-label="Close">×</button>' +
      '<h5>Install the Trekkr app</h5>' +
      '<p>Add Trekkr to your home screen for instant access. Free, no Play Store.</p>' +
      '<button class="installgo">Install</button>';
    d.body.appendChild(el);
    el.querySelector(".x").onclick = function () {
      el.remove(); try { localStorage.setItem("trekkr_installbar", "off"); } catch (e) {}
    };
    el.querySelector(".installgo").onclick = function () {
      if (!deferredInstall) { el.remove(); return; }
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function () { deferredInstall = null; el.remove(); });
    };
  }

  /* ---------- splash ---------- */
  function hideSplash() {
    var s = d.getElementById("splash"); if (!s) return;
    s.classList.add("hide");
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 500);
  }

  /* ---------- boot ---------- */
  // Read a query-string param (e.g. ?claim=Andi from a "claim your profile" email).
  function qparam(k) {
    try { return new URLSearchParams(w.location.search).get(k) || ""; } catch (e) { return ""; }
  }
  function boot() {
    setHTML('<div class="center"><div class="spinner"></div></div>');
    sb.auth.getSession().then(function (r) {
      S.session = r.data.session; S.token = S.session ? S.session.access_token : null;
      // The splash stays as an interactive welcome screen; the user taps Play Now.
      S.view = "welcome";
      // Deep link from a claim-outreach email: ?claim=<player name> opens the
      // Register/claim screen with the name pre-filled (one tap to claim).
      var cp = qparam("claim");
      if (cp) {
        S.claimPrefill = cp;
        S.view = "join";
        try { w.history.replaceState({}, "", w.location.pathname); } catch (e) {}
      }
      render();
      hideSplash();
    });
    sb.auth.onAuthStateChange(function (_e, session) {
      // INITIAL_SESSION fires on subscribe and duplicates getSession() above —
      // only sync the token here, never touch the view, or it clobbers a deep
      // link like /app?claim=<name> (which boot routed to the claim screen).
      if (_e === "INITIAL_SESSION") { S.session = session; S.token = session ? session.access_token : null; return; }
      var wasGuest = !S.session;
      S.session = session; S.token = session ? session.access_token : null;
      S.me = null; S.myName = ""; S.card = null;
      if (session && (wasGuest || S.view === "login")) S.view = "passport";
      if (!session) S.view = "welcome";
      render();
    });
  }
  function render() {
    if (S.view === "welcome") return renderWelcome();
    if (S.view === "login") return renderLogin();
    if (S.view === "join") return renderJoin();
    if (S.view === "forgot") return renderForgot();
    renderShell();
  }

  /* ---------- WELCOME ---------- */
  // Real registered-player count (social proof on the welcome screen). Cached.
  var _playerCount = null;
  function showCount(n) {
    var box = d.getElementById("wc-count"), num = d.getElementById("wc-num");
    if (!box || !num || !n) return;
    num.textContent = Number(n).toLocaleString("en-US") + "+";
    box.hidden = false;
  }
  function fillPlayerCount() {
    if (_playerCount != null) { showCount(_playerCount); return; }
    API.getLeaderboard({ limit: 1 }).then(function (r) {
      _playerCount = (r && r.total) || 0;
      showCount(_playerCount);
    }).catch(function () {});
  }
  function renderWelcome() {
    var signedIn = !!S.session;
    setHTML(
      '<div class="welcome">' +
        '<div class="wc-theme">' + themeBtnHTML("wc-theme-btn") + '</div>' +
        '<div class="wc-top">' +
          '<div class="wc-logo">Trekk<b>r</b></div>' +
          '<p class="wc-tag">Your padel passport — every match builds your journey.</p>' +
        '</div>' +
        '<ul class="wc-list">' +
          '<li><b>Live ELO &amp; tier</b><span>Watch your rating move after every match.</span></li>' +
          '<li><b>National rankings</b><span>See where you stand across Indonesia.</span></li>' +
          '<li><b>Ranked play &amp; league</b><span>Join ranked sessions, then the monthly league.</span></li>' +
        '</ul>' +
        '<div class="wc-count" id="wc-count" hidden><b id="wc-num">—</b><span>players already on Trekkr</span></div>' +
        '<div class="wc-cta">' +
          '<button class="btn" id="wc-start">Play Now</button>' +
          (signedIn ? '' : '<button class="link" id="wc-guest">Browse as guest</button>') +
          '<a class="link wc-admin" href="https://admin.trekkr.online" style="color:var(--faint);font-size:12px;margin-top:6px;text-decoration:none">Venue admin? Sign in →</a>' +
        '</div>' +
      '</div>'
    );
    maybeIosHint();
    wireThemeBtn("wc-theme-btn");
    fillPlayerCount();
    d.getElementById("wc-start").onclick = function () { S.view = S.session ? "passport" : "login"; render(); };
    var g = d.getElementById("wc-guest");
    if (g) g.onclick = function () { S.view = "rankings"; render(); };
  }

  /* ---------- LOGIN ---------- */
  function renderLogin() {
    setHTML(
      '<div class="login-wrap">' +
        '<button class="link" id="lback" style="align-self:flex-start;padding-left:0;margin-bottom:8px">‹ Back</button>' +
        '<div class="brand">Trekk<b>r</b></div>' +
        '<p class="sub">Sign in to your player account.</p>' +
        '<div class="field"><label class="label">Email</label>' +
          '<input class="input" id="email" type="email" autocomplete="email" placeholder="you@example.com"/></div>' +
        '<div class="field"><label class="label">Password</label>' +
          '<input class="input" id="pass" type="password" autocomplete="current-password" placeholder="Password"/></div>' +
        '<div class="msg err hidden" id="err"></div>' +
        '<button class="btn" id="go">Sign in</button>' +
        '<div style="text-align:center;margin-top:16px">' +
          '<button class="link" id="ljoin">No account yet? Register / claim</button><br>' +
          '<button class="link" id="lforgot" style="color:var(--faint)">Forgot password?</button>' +
        '</div>' +
      '</div>'
    );
    maybeIosHint();
    d.getElementById("lback").onclick = function () { S.view = "rankings"; render(); };
    d.getElementById("ljoin").onclick = function () { S.view = "join"; render(); };
    d.getElementById("lforgot").onclick = function () { S.view = "forgot"; render(); };
    var go = d.getElementById("go");
    async function submit() {
      var email = (d.getElementById("email").value || "").trim();
      var pass = d.getElementById("pass").value || "";
      var err = d.getElementById("err");
      err.classList.add("hidden");
      if (!email || !pass) { err.textContent = "Enter your email and password."; err.classList.remove("hidden"); return; }
      go.disabled = true; go.textContent = "Signing in…";
      var res = await sb.auth.signInWithPassword({ email: email, password: pass });
      if (res.error) {
        err.textContent = /Invalid login/.test(res.error.message) ? "Wrong email or password." : res.error.message;
        err.classList.remove("hidden"); go.disabled = false; go.textContent = "Sign in";
      }
    }
    go.onclick = submit;
    d.getElementById("pass").addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  }

  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "")); }

  /* ---------- JOIN (register new / claim existing) ---------- */
  function renderJoin() {
    var jPhoto = "", jSeed = "", jMode = "", jExisting = "", chkTimer = null, lastQ = "";
    setHTML(
      '<div class="login-wrap" style="justify-content:flex-start;padding-top:calc(var(--safe-t) + 20px)">' +
        '<button class="link" id="jback" style="align-self:flex-start;padding-left:0;margin-bottom:8px">‹ Back</button>' +
        '<div class="brand">Trekk<b>r</b></div>' +
        '<p class="sub">Enter your name — we\'ll check if you\'re already on Trekkr. If so you can <b>claim</b> your profile; if not, <b>register</b> as a new player.</p>' +
        '<div class="field"><label class="label">Full name</label>' +
          '<input class="input" id="jname" placeholder="e.g. Budi Santoso" autocomplete="name"/>' +
          '<div class="msg" id="jhint" style="min-height:16px"></div></div>' +
        '<div id="jdyn"></div>' +
        '<div style="text-align:center;margin-top:18px"><button class="link" id="jsignin">Already have an account? Sign in</button></div>' +
      '</div>'
    );
    maybeIosHint();
    d.getElementById("jback").onclick = function () { S.view = "login"; render(); };
    d.getElementById("jsignin").onclick = function () { S.view = "login"; render(); };
    var nameEl = d.getElementById("jname"), hintEl = d.getElementById("jhint"), dyn = d.getElementById("jdyn");
    function setHint(t, k) { hintEl.textContent = t || ""; hintEl.className = "msg" + (k ? " " + k : ""); hintEl.style.color = k === "ok" ? "var(--grn)" : (k === "err" ? "var(--red)" : "var(--mu)"); }

    nameEl.addEventListener("input", function () {
      clearTimeout(chkTimer); dyn.innerHTML = ""; jMode = "";
      var n = (nameEl.value || "").trim();
      if (n.length < 2) { setHint("", ""); return; }
      setHint("Checking name…", "");
      chkTimer = setTimeout(function () { doCheck(n); }, 450);
    });
    function doCheck(n) {
      lastQ = n;
      API.checkName(n).then(function (r) {
        if ((nameEl.value || "").trim() !== lastQ) return;
        if (r && r.exists) { setHint("", ""); renderClaimForm(r.name || n); }
        else { setHint("✓ New name — register as a new player.", "ok"); renderNewForm(); }
      }).catch(function () { setHint("Couldn't check name, try again.", "err"); });
    }

    function renderClaimForm(name) {
      jMode = "claim"; jExisting = name;
      dyn.innerHTML =
        '<div class="calib" style="margin-top:6px"><b>"' + esc(name) + '"</b> already exists on Trekkr. Claim it to manage your profile — your match history &amp; ELO stay. Claims are reviewed by an admin.</div>' +
        '<div class="field"><label class="label">Email</label><input class="input" id="cEmail" type="email" autocomplete="email" placeholder="you@example.com"/></div>' +
        '<div class="field"><label class="label">Create password</label><input class="input" id="cPass" type="password" autocomplete="new-password" placeholder="Min 6 characters"/></div>' +
        '<div class="msg err hidden" id="cMsg"></div>' +
        '<button class="btn" id="cGo">Submit claim</button>';
      d.getElementById("cGo").onclick = submitClaim;
    }
    async function submitClaim() {
      var email = (d.getElementById("cEmail").value || "").trim(), pass = d.getElementById("cPass").value || "", m = d.getElementById("cMsg");
      m.classList.add("hidden");
      if (!validEmail(email)) { m.textContent = "Enter a valid email."; m.classList.remove("hidden"); return; }
      if (pass.length < 6) { m.textContent = "Password must be at least 6 characters."; m.classList.remove("hidden"); return; }
      var b = d.getElementById("cGo"); b.disabled = true; b.textContent = "Submitting…";
      var res = await API.claimProfile({ player_name: jExisting, email: email, password: pass });
      if (res.ok) { joinDone("claim", jExisting); }
      else { m.textContent = (res.data && res.data.error) || "Couldn't submit claim."; m.classList.remove("hidden"); b.disabled = false; b.textContent = "Submit claim"; }
    }

    function renderNewForm() {
      jMode = "new";
      dyn.innerHTML =
        '<div class="row2" style="display:flex;gap:10px">' +
          '<div class="field" style="flex:1"><label class="label">Gender</label><select class="input" id="nGender"><option value="M">Male</option><option value="F">Female</option></select></div>' +
          '<div class="field" style="flex:1"><label class="label">Region <span style="font-weight:500;color:var(--faint)">(optional)</span></label><input class="input" id="nRegion" placeholder="e.g. Jakarta"/></div>' +
        '</div>' +
        '<div class="field"><label class="label">Padel experience <span style="font-weight:500;color:var(--faint)">(optional — seeds early matchmaking, not your tier)</span></label>' +
          '<div class="seedopts" id="nSeed">' +
            '<button type="button" class="seedopt" data-seed="900">Just starting / learning</button>' +
            '<button type="button" class="seedopt" data-seed="1000">Casual, plays regularly</button>' +
            '<button type="button" class="seedopt" data-seed="1500">Competitive / tournaments</button>' +
            '<button type="button" class="seedopt" data-seed="">Not sure</button>' +
          '</div></div>' +
        '<div class="field"><label class="label">Instagram <span style="font-weight:500;color:var(--faint)">(optional)</span></label><input class="input" id="nIg" placeholder="username"/></div>' +
        '<div class="field"><label class="label">Email</label><input class="input" id="nEmail" type="email" autocomplete="email" placeholder="you@example.com"/></div>' +
        '<div class="field"><label class="label">Create password</label><input class="input" id="nPass" type="password" autocomplete="new-password" placeholder="Min 6 characters"/></div>' +
        '<div class="field"><label class="label">Photo <span style="font-weight:500;color:var(--faint)">(optional)</span></label><div style="display:flex;align-items:center;gap:14px">' +
          '<div class="ava" id="nPv" style="width:56px;height:56px;border-radius:14px">👤</div>' +
          '<label class="btn ghost" style="width:auto;padding:10px 14px;margin:0">Upload<input type="file" id="nPhoto" accept="image/*" style="display:none"></label></div></div>' +
        '<div class="msg err hidden" id="nMsg"></div>' +
        '<button class="btn" id="nGo">Register</button>';
      d.getElementById("nSeed").addEventListener("click", function (e) {
        var c = e.target.closest(".seedopt"); if (!c) return;
        this.querySelectorAll(".seedopt").forEach(function (o) { o.classList.remove("on"); });
        c.classList.add("on"); jSeed = c.getAttribute("data-seed") || "";
      });
      d.getElementById("nPhoto").addEventListener("change", async function (e) {
        var f = e.target.files && e.target.files[0]; if (!f) return;
        try { jPhoto = await resizePhoto(f); d.getElementById("nPv").innerHTML = '<img src="' + jPhoto + '" alt=""/>'; }
        catch (err) { toast("Please pick an image file"); }
        e.target.value = "";
      });
      d.getElementById("nGo").onclick = submitNew;
    }
    async function submitNew() {
      var name = (nameEl.value || "").trim();
      var email = (d.getElementById("nEmail").value || "").trim(), pass = d.getElementById("nPass").value || "", m = d.getElementById("nMsg");
      m.classList.add("hidden");
      if (name.length < 2) { m.textContent = "Enter your full name."; m.classList.remove("hidden"); return; }
      if (!validEmail(email)) { m.textContent = "Enter a valid email."; m.classList.remove("hidden"); return; }
      if (pass.length < 6) { m.textContent = "Password must be at least 6 characters."; m.classList.remove("hidden"); return; }
      var body = { name: name, email: email, password: pass, gender: d.getElementById("nGender").value || "M", region: (d.getElementById("nRegion").value || "").trim(), ig: (d.getElementById("nIg").value || "").trim().replace(/^@+/, "") };
      if (jPhoto) body.photo = jPhoto;
      if (jSeed) body.seedEstimate = jSeed;
      var b = d.getElementById("nGo"); b.disabled = true; b.textContent = "Registering…";
      var res = await API.registerNew(body);
      if (res.ok) { joinDone("new", email); }
      else if (res.data && res.data.claim) { setHint("", ""); renderClaimForm(name); }
      else { m.textContent = (res.data && res.data.error) || "Couldn't register."; m.classList.remove("hidden"); b.disabled = false; b.textContent = "Register"; }
    }
    // Prefill from a claim-outreach deep link (?claim=<name>): fill the name and
    // trigger the check so the claim form appears automatically.
    if (S.claimPrefill) { nameEl.value = S.claimPrefill; S.claimPrefill = null; }
    if ((nameEl.value || "").trim().length >= 2) nameEl.dispatchEvent(new Event("input"));
  }
  function joinDone(kind, detail) {
    var isNew = kind === "new";
    setHTML('<div class="login-wrap"><div class="emptybig" style="padding-top:0">' +
      '<div class="em">' + (isNew ? "📧" : "⏳") + '</div>' +
      '<h1 class="page" style="margin-top:12px">' + (isNew ? "Check your email" : "Claim submitted") + '</h1>' +
      '<p style="color:var(--mu);font-size:14px;line-height:1.6;max-width:34ch;margin:0 auto">' +
        (isNew
          ? 'We sent a confirmation link to <b>' + esc(detail) + '</b>. Tap it to activate your account, then sign in. Then play at a Trekkr partner venue so your matches count and your rating starts.'
          : 'Your claim for <b>' + esc(detail) + '</b> is pending admin review. Once approved you can sign in with the email &amp; password you just created.') +
      '</p>' +
      '<button class="btn" id="jdone" style="max-width:240px;margin:20px auto 0">Back to sign in</button>' +
      '</div></div>');
    d.getElementById("jdone").onclick = function () { S.view = "login"; render(); };
  }

  /* ---------- FORGOT PASSWORD ---------- */
  function renderForgot() {
    setHTML(
      '<div class="login-wrap">' +
        '<button class="link" id="fback" style="align-self:flex-start;padding-left:0;margin-bottom:8px">‹ Back</button>' +
        '<div class="brand">Reset password</div>' +
        '<p class="sub">Enter your account email and we\'ll send a reset link.</p>' +
        '<div class="field"><label class="label">Email</label><input class="input" id="fEmail" type="email" autocomplete="email" placeholder="you@example.com"/></div>' +
        '<div class="msg hidden" id="fMsg"></div>' +
        '<button class="btn" id="fGo">Send reset link</button>' +
      '</div>'
    );
    d.getElementById("fback").onclick = function () { S.view = "login"; render(); };
    var go = d.getElementById("fGo");
    go.onclick = async function () {
      var email = (d.getElementById("fEmail").value || "").trim(), m = d.getElementById("fMsg");
      m.classList.add("hidden");
      if (!validEmail(email)) { m.textContent = "Enter a valid email."; m.className = "msg err"; return; }
      go.disabled = true; go.textContent = "Sending…";
      try { await API.forgotPassword(email); } catch (e) {}
      m.textContent = "If that email is registered, a reset link is on its way. Check your inbox (and spam).";
      m.className = "msg"; m.style.color = "var(--grn)"; m.classList.remove("hidden");
      go.disabled = false; go.textContent = "Send reset link";
    };
  }

  /* ---------- SHELL ---------- */
  function renderShell() {
    var header = S.session ? "" :
      '<div class="appheader"><span class="ah-brand">Trekk<b>r</b></span>' +
      '<div class="ah-right">' + themeBtnHTML("ah-theme") +
      '<button class="ah-signin" id="ah-signin">Sign in</button></div></div>';
    setHTML(header + '<div id="view"></div>' + tabbarHTML());
    var si = d.getElementById("ah-signin");
    if (si) si.onclick = function () { S.view = "login"; render(); };
    wireThemeBtn("ah-theme");
    bindTabs();
    renderView();
  }
  var TAB_ICONS = {
    // Passport → ID card
    passport: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8" cy="10.8" r="2"/><path d="M5.4 16c.5-1.4 1.5-2.1 2.6-2.1s2.1.7 2.6 2.1"/><line x1="14" y1="10" x2="19" y2="10"/><line x1="14" y1="13.5" x2="18" y2="13.5"/></svg>',
    // Rankings → trophy
    rankings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v4.5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4.6a2.4 2.4 0 0 0 3 2.6"/><path d="M17 6h2.4a2.4 2.4 0 0 1-3 2.6"/><path d="M9.5 16.5h5l.6 3.5h-6.2z"/><line x1="12" y1="13.4" x2="12" y2="16.5"/></svg>',
    // Play → racket
    main: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="10.2" cy="8.8" rx="6" ry="6.6"/><path d="M6.5 13.4 3.7 20.3"/><path d="M8.7 18.7 5.9 21"/><path d="M6.6 8.7 13.8 6M6.9 11.4l6.6-2.6M9.6 5.2l3.8 6.4" stroke-width="1"/></svg>',
    // History → clock/log
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3 1.8"/></svg>',
    // Profile → person
    profil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.4-3.6 3.4-6 7.2-6s6.8 2.4 7.2 6"/></svg>',
  };
  function tabbarHTML() {
    var tabs = [["passport", "Passport"], ["rankings", "Rankings"], ["main", "PlayRank"], ["history", "History"], ["profil", "Profile"]];
    var active = S.view;
    if (S.view === "ranked-info") active = (S.prev === "passport") ? "passport" : "profil";
    if (S.view === "player") active = "rankings";
    if (S.view === "edit") active = "profil";
    return '<nav class="tabbar">' + tabs.map(function (t) {
      return '<button class="tab' + (t[0] === active ? " on" : "") + '" data-tab="' + t[0] + '"><span class="ic">' + TAB_ICONS[t[0]] + '</span>' + t[1] + '</button>';
    }).join("") + '</nav>';
  }
  function bindTabs() {
    Array.prototype.forEach.call(d.querySelectorAll(".tab"), function (b) {
      b.onclick = function () { S.view = b.getAttribute("data-tab"); refreshTabbar(); renderView(); w.scrollTo(0, 0); };
    });
  }
  function refreshTabbar() { var old = d.querySelector(".tabbar"); if (old) old.outerHTML = tabbarHTML(); bindTabs(); }
  function viewEl() { return d.getElementById("view"); }
  function renderView() {
    if (S.view === "passport") return S.session ? renderPassport() : renderSignIn("your passport");
    if (S.view === "rankings") return renderRankings();
    if (S.view === "main") return renderMain();
    if (S.view === "history") return S.session ? renderHistory() : renderSignIn("your match history");
    if (S.view === "profil") return S.session ? renderProfil() : renderSignIn("your profile");
    if (S.view === "ranked-info") return renderRankedInfo();
    if (S.view === "player") return renderPlayerProfile();
    if (S.view === "edit") return S.session ? renderEditProfile() : renderSignIn("your profile");
  }
  function renderSignIn(what) {
    viewEl().innerHTML = '<div class="screen"><div class="emptybig"><div class="em">🎾</div>' +
      '<h1 class="page" style="margin-top:14px">Sign in</h1>' +
      '<p style="color:var(--mu);font-size:14px;line-height:1.6;max-width:32ch;margin:0 auto">Sign in to see ' + esc(what) + '. You can browse Rankings &amp; Play without an account.</p>' +
      '<button class="btn" id="signin" style="max-width:240px;margin:18px auto 0">Sign in / Register</button></div></div>';
    d.getElementById("signin").onclick = function () { S.view = "login"; render(); };
  }

  async function ensureMe() {
    if (!S.token) { S.me = { player: null }; S.myName = ""; return S.me; }
    if (!S.me) S.me = await API.accountMe(S.token);
    S.myName = (S.me && S.me.player && S.me.player.name) || "";
    return S.me;
  }
  async function ensureCut() { if (!S.cut) { try { S.cut = await API.getTierBoundaries(); } catch (e) { S.cut = { t1: 2000, t2: 1500 }; } } return S.cut; }

  /* ---------- PASSPORT ---------- */
  async function renderPassport() {
    viewEl().innerHTML = '<div class="center"><div class="spinner"></div></div>';
    try {
      var me = await ensureMe();
      if (!me.player || !me.player.name) return passportNoPlayer(me);
      var name = me.player.name;
      var r = await Promise.all([
        API.getPlayer(name).catch(function () { return {}; }),
        ensureCut(),
        API.getPlayerMatches(name).catch(function () { return { matches: [] }; }),
        API.getLeaderboard({ limit: 5000 }).catch(function () { return { leaderboard: [] }; }),
      ]);
      var det = r[0] || {}, cut = r[1];
      var st = det.stats || {};                 // {currentElo,unrated,totalMatches,totalW,totalL,winRate,streak}
      var pd = det.player || {};                // profile fields
      var hist = det.history || [];             // [{elo,delta,w,l,timestamp}]
      var matchesArr = (r[2] && r[2].matches) || [];

      var display = pd.displayName || me.player.displayName || name;
      var photo = pd.photoUrl || me.player.photo_url || me.player.photoUrl || "";
      var region = pd.region || me.player.region || "";
      var club = ((pd.clubs || me.player.clubs || "").split(",")[0] || "").trim();

      var elo = st.currentElo != null ? st.currentElo : (hist.length ? hist[hist.length - 1].elo : (me.player.elo != null ? me.player.elo : null));
      var unrated = (st.unrated != null ? !!st.unrated : (hist.length === 0)) || elo == null;
      var wins = st.totalW != null ? st.totalW : null;
      var losses = st.totalL != null ? st.totalL : null;
      var matches = st.totalMatches != null ? st.totalMatches : hist.reduce(function (a, h) { return a + (h.w || 0) + (h.l || 0); }, 0);
      var winRate = st.winRate != null ? st.winRate : (matches ? Math.round((wins || 0) / matches * 100) : 0);
      var streak = st.streak && st.streak !== "0" ? st.streak : "—";
      var last = hist.length ? hist[hist.length - 1] : null;
      var tier = unrated ? null : API.tierName(elo, cut);
      var bp = bestPartner(matchesArr, [name, display]);
      var results = matchResults(matchesArr, [name, display]).slice(0, 6);

      // Achievement badges (earned ones surfaced first).
      var eloMap = {};
      ((r[3] && r[3].leaderboard) || []).forEach(function (p) { if (p && p.name) eloMap[String(p.name).toLowerCase().trim()] = Number(p.elo) || 0; });
      var histForBadges = hist.map(function (h) { return { elo: h.elo, date: h.timestamp }; });
      var badges = computeBadges({ player: { name: name, displayName: display }, stats: { currentElo: elo, totalMatches: matches, winRate: winRate }, history: histForBadges }, matchesArr, eloMap);
      badges.sort(function (a, b) { return (b.earned ? 1 : 0) - (a.earned ? 1 : 0); });
      var earnedCount = badges.filter(function (b) { return b.earned; }).length;

      S.card = { display: display, name: name, elo: elo, tier: tier, wins: wins, losses: losses, matches: matches, unrated: unrated, photo: photo, region: region, slug: slug(name), partner: bp };

      // Tier progress toward the next Series Tier (dynamic cutoffs).
      var t1 = (cut && cut.t1) || 2000, t2 = (cut && cut.t2) || 1500, tp = "";
      if (!unrated) {
        var prog = 100, away = 0, nx = "";
        if (elo >= t1) { prog = 100; }
        else if (elo >= t2) { prog = Math.round((elo - t2) / (t1 - t2) * 100); away = t1 - elo; nx = "T1 · Open"; }
        else { prog = Math.round(elo / t2 * 100); away = t2 - elo; nx = "T2 · Contender"; }
        prog = Math.max(4, Math.min(100, prog));
        tp = '<div class="tierprog"><div class="tp-top"><span class="tp-cur">' + esc(tier) + '</span>' +
          (nx ? '<span class="tp-away">' + away + ' pts to ' + esc(nx) + '</span>' : '<span class="tp-away">Top tier 🔥</span>') +
          '</div><div class="tp-bar"><div class="tp-fill" style="width:' + prog + '%"></div></div></div>';
      }

      var heroInner = unrated
        ? '<p class="lbl">ELO Rating</p><p class="num" style="font-size:34px">Unrated</p><p style="margin:6px 0 0;font-size:12.5px;opacity:.92">Your rating appears after your first PlayRank match</p>'
        : '<p class="lbl">ELO Rating</p><p class="num">' + elo + '</p>' +
          '<span class="tier">🏆 ' + esc(tier) + '</span>' +
          (last && last.delta ? '<span class="delta">' + (last.delta >= 0 ? "▲ +" : "▼ ") + Math.abs(last.delta) + '</span>' : "");

      var calib = (!unrated && matches < 15)
        ? '<div class="calib"><b>Calibrating:</b> ' + Math.max(0, 15 - matches) + ' more matches until your tier is set. Your ELO moves faster during this window.</div>'
        : "";

      var statGrid = '<div class="statrow4">' +
        '<div class="stat"><b>' + (matches != null ? matches : "–") + '</b><span>Matches</span></div>' +
        '<div class="stat hl"><b>' + (matches ? winRate + "%" : "–") + '</b><span>Win Rate</span></div>' +
        '<div class="stat"><b>' + (wins != null ? wins : "–") + "/" + (losses != null ? losses : "–") + '</b><span>W / L</span></div>' +
        '<div class="stat"><b>' + esc(streak) + '</b><span>Streak</span></div></div>';

      var recentHTML = results.length
        ? '<div class="sec">Recent matches</div>' + results.map(function (x) {
            return '<div class="mrow"><span class="mres ' + x.res + '">' + x.res + '</span>' +
              '<div class="mmid"><b>' + (x.partner ? "with " + esc(x.partner) : "vs " + esc(x.opps || "—")) + '</b>' +
              '<span>' + esc(x.date ? fmtDate(x.ts || x.date) : "—") + (x.opps && x.partner ? " · vs " + esc(x.opps) : "") + '</span></div>' +
              '<span class="msc">' + x.sf + '–' + x.sa + '</span></div>';
          }).join("")
        : (hist.length ? '<div class="sec">Recent ELO</div>' + hist.slice(-6).reverse().map(function (h) {
            var up = (h.delta || 0) >= 0;
            return '<div class="hitem"><span class="d">' + esc(fmtDate(h.timestamp)) + '</span><span class="e">' + h.elo + '</span>' +
              '<span class="' + (up ? "up" : "dn") + '">' + (up ? "▲ +" : "▼ ") + Math.abs(h.delta || 0) + '</span></div>';
          }).join("") : "");

      var spark = (!unrated && hist.length > 1) ? '<div class="sec">ELO progress</div><div class="sparkcard">' + sparkline(hist) + '</div>' : "";

      var badgesHTML = '<div class="sec">Badges <span class="badgecount">' + earnedCount + '/' + badges.length + '</span></div>' +
        '<div class="badgegrid">' + badges.map(function (b, i) {
          return '<button class="badge' + (b.earned ? " earned" : "") + '" data-bi="' + i + '"><span class="be">' + b.def.emoji + '</span><span class="bn">' + esc(b.def.name) + '</span></button>';
        }).join("") + '</div>';

      viewEl().innerHTML =
        '<div class="screen">' +
          '<div class="p-top"><div><div class="p-hi">Passport</div><div class="p-name">' + esc(display) + '</div>' +
            (region || club ? '<div class="p-meta">' + esc([region, club].filter(Boolean).join(" · ")) + '</div>' : "") + '</div>' +
            '<div class="p-actions">' + themeBtnHTML("pp-theme") +
              '<button class="ava" id="pp-av" aria-label="Edit profile" style="padding:0;border:none">' + (photo ? '<img src="' + esc(photo) + '" alt=""/>' : esc(initials(display))) + '</button>' +
            '</div></div>' +
          '<div class="hero">' + heroInner + '</div>' +
          calib + tp + statGrid +
          (bp ? '<div class="sec">Best partner</div><div class="hitem"><span class="d"><b style="color:var(--ink)">' + esc(bp.name) + '</b></span><span class="up">' + bp.w + '–' + bp.l + '</span></div>' : "") +
          badgesHTML +
          spark +
          '<div class="actrow"><button class="btn" id="share">Share Card</button>' +
            '<button class="btn ghost soon" id="challenge" style="flex:0 0 auto;width:auto;padding:15px 16px">Challenge</button></div>' +
          recentHTML +
          '<button class="link" id="howto" style="display:block;margin:18px auto 0">How to get ranked ›</button>' +
        '</div>';

      wireThemeBtn("pp-theme");
      Array.prototype.forEach.call(d.querySelectorAll(".badge"), function (b) { b.onclick = function () { showBadge(badges[+b.getAttribute("data-bi")]); }; });
      d.getElementById("pp-av").onclick = function () { S.view = "edit"; refreshTabbar(); renderView(); w.scrollTo(0, 0); };
      d.getElementById("challenge").onclick = function () { toast("Challenge players — coming soon 🔜"); };
      d.getElementById("share").onclick = shareCard;
      d.getElementById("howto").onclick = function () { S.prev = "passport"; S.view = "ranked-info"; refreshTabbar(); renderView(); w.scrollTo(0, 0); };
    } catch (e) {
      viewEl().innerHTML = errorBox("Couldn't load your passport.", renderPassport);
    }
  }
  /* ---------- HISTORY (all matches + ELO history) ---------- */
  async function renderHistory() {
    viewEl().innerHTML = '<div class="center" style="min-height:40vh"><div class="spinner"></div></div>';
    try {
      var me = await ensureMe();
      if (!me.player || !me.player.name) return passportNoPlayer(me);
      var name = me.player.name;
      var r = await Promise.all([
        API.getPlayer(name).catch(function () { return {}; }),
        API.getPlayerMatches(name).catch(function () { return { matches: [] }; }),
        ensureCut(),
      ]);
      var det = r[0] || {}, matchesArr = (r[1] && r[1].matches) || [], cut = r[2];
      var st = det.stats || {}, pd = det.player || {}, hist = det.history || [];
      var display = pd.displayName || me.player.displayName || name;
      var elo = st.currentElo != null ? st.currentElo : (hist.length ? hist[hist.length - 1].elo : null);
      var unrated = (st.unrated != null ? !!st.unrated : (hist.length === 0)) || elo == null;
      var tier = unrated ? null : API.tierName(elo, cut);
      var results = matchResults(matchesArr, [name, display]); // all matches, newest first

      var totalM = results.length;
      var wCount = results.filter(function (x) { return x.res === "W"; }).length;
      var lCount = results.filter(function (x) { return x.res === "L"; }).length;
      var pdNet = results.reduce(function (a, x) { return a + (x.pd || 0); }, 0);
      var winRate = totalM ? Math.round(wCount / totalM * 100) : 0;

      var statRow =
        '<div class="statrow4">' +
          '<div class="stat"><b>' + totalM + '</b><span>Matches</span></div>' +
          '<div class="stat"><b>' + wCount + '–' + lCount + '</b><span>W–L</span></div>' +
          '<div class="stat"><b>' + winRate + '%</b><span>Win rate</span></div>' +
          '<div class="stat hl"><b>' + (pdNet >= 0 ? "+" : "") + pdNet + '</b><span>Point diff</span></div>' +
        '</div>';

      var eloCard =
        '<div class="sparkcard">' +
          '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:2px">' +
            '<div><span class="p-hi">ELO history</span></div>' +
            '<div style="text-align:right"><b style="font-size:22px;color:var(--or)">' + (elo != null ? elo : "—") + '</b>' +
              (tier ? '<span style="font-size:12px;color:var(--faint);font-weight:700;margin-left:6px">' + esc(tier) + '</span>' : "") + '</div>' +
          '</div>' +
          (sparkline(hist) || '<p style="color:var(--faint);font-size:12.5px;margin:8px 0 2px">Your ELO chart appears after a few matches.</p>') +
        '</div>';

      var eloLog = hist.length
        ? '<div class="sec">ELO by session</div>' + hist.slice().reverse().map(function (h) {
            var up = (h.delta || 0) >= 0;
            return '<div class="hitem"><span class="d">' + esc(fmtDate(h.timestamp)) + '</span>' +
              '<span style="flex:1;font-size:12px;color:var(--faint)">' + (h.w || 0) + 'W–' + (h.l || 0) + 'L</span>' +
              '<span class="e">' + h.elo + '</span>' +
              '<span class="' + (up ? "up" : "dn") + '" style="min-width:52px;text-align:right">' + (up ? "▲ +" : "▼ ") + Math.abs(h.delta || 0) + '</span></div>';
          }).join("")
        : "";

      var matchList = results.length
        ? '<div class="sec">All matches · ' + totalM + '</div>' + results.map(function (x) {
            var meta = [x.date ? fmtDate(x.ts || x.date) : "", x.venue].filter(Boolean).join(" · ");
            var line = (x.partner ? "with " + esc(x.partner) + " · " : "") + "vs " + esc(x.opps || "—");
            var pdTxt = '<span class="' + ((x.pd || 0) >= 0 ? "up" : "dn") + '">' + ((x.pd || 0) >= 0 ? "+" : "") + (x.pd || 0) + '</span>';
            return '<div class="mrow"><span class="mres ' + x.res + '">' + x.res + '</span>' +
              '<div class="mmid"><b>' + line + '</b><span>' + esc(meta) + '</span></div>' +
              '<div style="text-align:right"><span class="msc">' + x.sf + '–' + x.sa + '</span>' +
              '<div style="font-size:11px;font-weight:700;margin-top:1px">' + pdTxt + ' pts</div></div></div>';
          }).join("")
        : '<div class="plain"><h3>No matches yet</h3><p>Play a PlayRank session at a partner venue — your matches and ELO will show up here.</p></div>';

      viewEl().innerHTML = '<div class="screen"><h1 class="page">History</h1>' +
        '<p class="lede">Every match you\'ve played, with results and your ELO over time.</p>' +
        statRow + eloCard + eloLog + matchList + '</div>';
    } catch (e) {
      viewEl().innerHTML = errorBox("Couldn't load your history.", renderHistory);
    }
  }
  function passportNoPlayer(me) {
    var claim = me && me.claim;
    if (claim && String(claim.status || "").toLowerCase() === "pending") {
      viewEl().innerHTML = '<div class="screen"><div class="emptybig"><div class="em">⏳</div>' +
        '<h1 class="page" style="margin-top:14px">Claim pending</h1>' +
        '<p style="color:var(--mu);font-size:14px;line-height:1.6;max-width:34ch;margin:0 auto">Your claim for <b>' + esc(claim.player_name || "") + '</b> is being reviewed by an admin. You\'ll be linked to your passport once it\'s approved.</p>' +
        '</div></div>';
      return;
    }
    viewEl().innerHTML = '<div class="screen"><div class="emptybig"><div class="em">🔗</div>' +
      '<h1 class="page" style="margin-top:14px">Not linked yet</h1>' +
      '<p style="color:var(--mu);font-size:14px;line-height:1.6;max-width:34ch;margin:0 auto">This account (' + esc(me.email || "") + ') isn\'t linked to a player profile yet. Register or claim your profile — it only takes a minute.</p>' +
      '<button class="btn" id="pnp-join" style="max-width:240px;margin:18px auto 0">Register / claim profile</button></div></div>';
    var j = d.getElementById("pnp-join"); if (j) j.onclick = function () { S.view = "join"; render(); };
  }

  /* ---------- SHARE — night card (1080×1920) ---------- */
  function loadImg(src) {
    return new Promise(function (res, rej) { var im = new Image(); im.crossOrigin = "anonymous"; im.onload = function () { res(im); }; im.onerror = rej; im.src = src; });
  }
  function drawNightCard(ctx, W, H, data, img) {
    var PHOTO_H = Math.round(H * 0.54);
    ctx.fillStyle = "#080808"; ctx.fillRect(0, 0, W, H);
    // top: photo (cover) or initials panel
    if (img) {
      var s = Math.max(W / img.width, PHOTO_H / img.height);
      var dw = img.width * s, dh = img.height * s, dx = (W - dw) / 2, dy = (PHOTO_H - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
      var g = ctx.createLinearGradient(0, PHOTO_H * 0.35, 0, PHOTO_H);
      g.addColorStop(0, "rgba(8,8,8,0)"); g.addColorStop(1, "#080808");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, PHOTO_H);
    } else {
      ctx.fillStyle = "#141414"; ctx.fillRect(0, 0, W, PHOTO_H);
      ctx.fillStyle = "#242424"; ctx.font = "700 320px 'Saira Condensed',sans-serif"; ctx.textAlign = "center";
      ctx.fillText(initials(data.display), W / 2, Math.round(PHOTO_H * 0.62));
    }
    // name + url + sub
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff"; ctx.font = "800 74px 'Saira Condensed',sans-serif";
    ctx.fillText(String(data.display).toUpperCase(), 60, PHOTO_H - 96);
    ctx.fillStyle = "#FF8A3D"; ctx.font = "600 30px 'Plus Jakarta Sans',sans-serif";
    ctx.fillText("trekkr.online/player/" + data.slug, 60, PHOTO_H - 54);
    if (data.region) { ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = "400 30px 'Plus Jakarta Sans',sans-serif"; ctx.fillText(data.region, 60, PHOTO_H - 16); }
    // ELO + tier
    var eloY = PHOTO_H + 150;
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.font = "700 22px 'Plus Jakarta Sans',sans-serif"; ctx.textAlign = "left";
    ctx.fillText("ELO RATING", 60, eloY);
    ctx.fillStyle = "#fff"; ctx.font = "800 150px 'Saira Condensed',sans-serif";
    ctx.fillText(data.unrated ? "—" : String(data.elo), 60, eloY + 140);
    if (!data.unrated && data.tier) {
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.font = "700 22px 'Plus Jakarta Sans',sans-serif"; ctx.textAlign = "right";
      ctx.fillText("TIER", W - 60, eloY);
      ctx.fillStyle = "#FFB000"; ctx.font = "800 60px 'Saira Condensed',sans-serif";
      ctx.fillText(String(data.tier).split(" · ")[0], W - 60, eloY + 58);
    }
    // stat boxes
    var stats = [["WINS", data.wins], ["LOSSES", data.losses], ["MATCHES", data.matches]];
    var bY = eloY + 260, bGap = 24, bW = (W - 120 - bGap * 2) / 3, bH = 150, bX = 60;
    stats.forEach(function (st, i) {
      var x = bX + i * (bW + bGap);
      ctx.fillStyle = "#141414"; roundRect(ctx, x, bY, bW, bH, 20); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "800 66px 'Saira Condensed',sans-serif"; ctx.textAlign = "center";
      ctx.fillText(st[1] != null ? String(st[1]) : "–", x + bW / 2, bY + 86);
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.font = "700 22px 'Plus Jakarta Sans',sans-serif";
      ctx.fillText(st[0], x + bW / 2, bY + bH - 22);
    });
    // best partner
    if (data.partner) {
      var pY = bY + bH + 56;
      ctx.fillStyle = "#141414"; roundRect(ctx, 60, pY, W - 120, 150, 20); ctx.fill();
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "700 22px 'Plus Jakarta Sans',sans-serif";
      ctx.fillText("BEST PARTNER", 96, pY + 46);
      ctx.fillStyle = "#fff"; ctx.font = "800 52px 'Saira Condensed',sans-serif";
      ctx.fillText(String(data.partner.name).toUpperCase(), 96, pY + 108, W - 320);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "700 22px 'Plus Jakarta Sans',sans-serif";
      ctx.fillText("TOGETHER", W - 96, pY + 46);
      ctx.fillStyle = "#4ADE80"; ctx.font = "800 44px 'Saira Condensed',sans-serif";
      ctx.fillText(data.partner.w + "–" + data.partner.l, W - 96, pY + 104);
    }
    // footer
    ctx.fillStyle = "#fff"; ctx.font = "800 50px 'Saira Condensed',sans-serif"; ctx.textAlign = "left";
    ctx.fillText("TREKKR", 60, H - 56);
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "400 28px 'Plus Jakarta Sans',sans-serif"; ctx.textAlign = "right";
    ctx.fillText("Visit trekkr.online", W - 60, H - 56);
  }
  function roundRect(ctx, x, y, w2, h2, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w2, y, x + w2, y + h2, r); ctx.arcTo(x + w2, y + h2, x, y + h2, r);
    ctx.arcTo(x, y + h2, x, y, r); ctx.arcTo(x, y, x + w2, y, r); ctx.closePath();
  }
  async function shareCard() {
    var data = S.card; if (!data) return;
    toast("Generating card…");
    try { if (d.fonts && d.fonts.ready) await d.fonts.ready; } catch (e) {}
    var img = null;
    if (data.photo) { try { img = await loadImg(data.photo); } catch (e) { img = null; } }
    var W = 1080, H = 1920;
    var canvas = d.createElement("canvas"); canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d");
    function draw(useImg) { drawNightCard(ctx, W, H, data, useImg); }
    draw(img);
    function exportOnce(retryNoPhoto) {
      try {
        canvas.toBlob(function (blob) {
          if (!blob) { if (retryNoPhoto) { draw(null); exportOnce(false); } else toast("Couldn't create card"); return; }
          shareBlob(blob, data);
        }, "image/png");
      } catch (e) {
        // tainted canvas (photo without CORS) → redraw without photo
        if (retryNoPhoto) { draw(null); exportOnce(false); } else toast("Couldn't create card");
      }
    }
    exportOnce(!!img);
  }
  function shareBlob(blob, data) {
    var fname = "trekkr-" + (data.slug || "player") + ".png";
    var file = new File([blob], fname, { type: "image/png" });
    var text = data.unrated ? (data.display + " on Trekkr") : (data.display + " — " + data.elo + " ELO · " + data.tier + " on Trekkr");
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: text }).catch(function () {});
    } else {
      var a = d.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fname; d.body.appendChild(a); a.click(); a.remove();
      toast("Card downloaded");
    }
  }

  /* ---------- RANKINGS ---------- */
  async function renderRankings() {
    viewEl().innerHTML = '<div class="screen"><div class="center" style="min-height:40vh"><div class="spinner"></div></div></div>';
    S.rankGender = S.rankGender || "M";
    S.rankMode = S.rankMode || "rated";       // rated | calib
    S.rankFilter = S.rankFilter || "all";
    try {
      var r = await Promise.all([API.getLeaderboard({ limit: 100000 }), ensureCut(), ensureMe().catch(function () { return null; })]);
      var raw = ((r[0] && r[0].leaderboard) || []).filter(function (p) { return !isWalkout(p.name) && !isWalkout(p.displayName); });
      var cut = r[1];
      function tierOf(elo) { return elo >= ((cut && cut.t1) || 2000) ? "T1" : elo >= ((cut && cut.t2) || 1500) ? "T2" : "T3"; }
      var g = S.rankGender, mode = S.rankMode, f = S.rankFilter;

      // Gender pool, then split calibrated (15+) vs calibrating (1–14).
      var pool = raw.filter(function (p) { return (String(p.gender || "M").toUpperCase() === "F" ? "F" : "M") === g; });
      var rated = pool.filter(function (p) { return (Number(p.totalMatches) || 0) >= 15; })
        .map(function (p) { return { name: p.name, disp: p.display || p.name, elo: Number(p.elo) || 0, region: p.region, photo: p.photoUrl }; })
        .sort(function (a, b) { return b.elo - a.elo; });
      var calib = pool.filter(function (p) { var m = Number(p.totalMatches) || 0; return m >= 1 && m < 15; })
        .map(function (p) { return { name: p.name, disp: p.display || p.name, elo: Number(p.elo) || 0, region: p.region, photo: p.photoUrl, m: Number(p.totalMatches) || 0 }; })
        .sort(function (a, b) { return b.elo - a.elo; });

      var genderSeg = '<div class="seg" id="genderSeg">' +
        '<button data-g="M"' + (g === "M" ? ' class="on"' : "") + '>Men</button>' +
        '<button data-g="F"' + (g === "F" ? ' class="on"' : "") + '>Women</button></div>';
      var poolSeg = '<div class="seg" id="poolSeg" style="margin-top:8px">' +
        '<button data-m="rated"' + (mode === "rated" ? ' class="on"' : "") + '>Calibrated <span class="segn">' + rated.length + '</span></button>' +
        '<button data-m="calib"' + (mode === "calib" ? ' class="on"' : "") + '>Calibrating <span class="segn">' + calib.length + '</span></button></div>';
      var chips = [["all", "All"], ["T1", "T1"], ["T2", "T2"], ["T3", "T3"]].map(function (c) {
        return '<button class="chip' + (f === c[0] ? " on" : "") + '" data-f="' + c[0] + '">' + c[1] + '</button>';
      }).join("");

      var body;
      if (mode === "rated") {
        var rows = rated.filter(function (p) { return f === "all" || tierOf(p.elo) === f; }).map(function (p, i) {
          var rank = i + 1;   // rank within the active tier (All = national)
          var mine = S.myName && norm(p.name) === norm(S.myName);
          return '<div class="rrow' + (rank <= 3 ? " top" : "") + (mine ? " me" : "") + '" data-name="' + esc(p.name) + '" role="button">' +
            '<span class="rk">' + rank + '</span>' + rowAvatar(p.photo, p.disp || p.name) +
            '<span class="who"><span class="nm"><span class="nmtxt">' + esc(p.disp || p.name) + (mine ? " · you" : "") + '</span>' + checkBadge(true) + '</span>' +
            (p.region ? '<span class="mt">' + esc(p.region) + '</span>' : "") + '</span>' +
            '<span class="el">' + p.elo + '</span><span class="rchev">›</span></div>';
        }).join("");
        body = rows || '<div class="emptybig"><div class="em">🏆</div><p>No calibrated players in this filter yet.</p></div>';
      } else {
        var crows = calib.filter(function (p) { return f === "all" || tierOf(p.elo) === f; }).map(function (p) {
          var mine = S.myName && norm(p.name) === norm(S.myName);
          return '<div class="rrow' + (mine ? " me" : "") + '" data-name="' + esc(p.name) + '" role="button">' +
            '<span class="rk">·</span>' + rowAvatar(p.photo, p.disp || p.name) +
            '<span class="who"><span class="nm"><span class="nmtxt">' + esc(p.disp || p.name) + (mine ? " · you" : "") + '</span>' + checkBadge(false) + '</span>' +
            '<span class="mt">' + (p.region ? esc(p.region) + " · " : "") + p.m + '/15 matches</span></span>' +
            '<span class="el prov-el">' + p.elo + '</span><span class="rchev">›</span></div>';
        }).join("");
        body = crows
          ? '<div class="rsub" style="margin:2px 4px 10px">Rating firms up after 15 matches — grey check until then.</div>' + crows
          : '<div class="emptybig"><div class="em">⏳</div><p>No players calibrating in this filter.</p></div>';
      }

      viewEl().innerHTML = '<div class="screen">' +
        '<div class="rtitle">Rankings</div><div class="rsub">' + (g === "F" ? "Women" : "Men") + ' · national</div>' +
        genderSeg + poolSeg +
        '<div class="chips" style="margin-top:12px">' + chips + '</div>' +
        body +
        '</div>';

      Array.prototype.forEach.call(d.querySelectorAll("#genderSeg button"), function (b) { b.onclick = function () { S.rankGender = b.getAttribute("data-g"); renderRankings(); }; });
      Array.prototype.forEach.call(d.querySelectorAll("#poolSeg button"), function (b) { b.onclick = function () { S.rankMode = b.getAttribute("data-m"); renderRankings(); }; });
      Array.prototype.forEach.call(d.querySelectorAll(".chip"), function (c) { c.onclick = function () { S.rankFilter = c.getAttribute("data-f"); renderRankings(); }; });
      Array.prototype.forEach.call(d.querySelectorAll(".rrow"), function (rw) {
        rw.onclick = function () { S.playerView = rw.getAttribute("data-name"); S.view = "player"; refreshTabbar(); renderView(); w.scrollTo(0, 0); };
      });
    } catch (e) { viewEl().innerHTML = errorBox("Couldn't load rankings.", renderRankings); }
  }

  /* ---------- PLAYER mini-profile (read-only) ---------- */
  async function renderPlayerProfile() {
    var name = S.playerView;
    viewEl().innerHTML = '<div class="screen"><button class="link" id="back" style="padding-left:0">‹ Back</button><div class="center" style="min-height:36vh"><div class="spinner"></div></div></div>';
    d.getElementById("back").onclick = function () { S.view = "rankings"; refreshTabbar(); renderView(); };
    try {
      var r = await Promise.all([
        API.getPlayer(name).catch(function () { return {}; }),
        ensureCut(),
      ]);
      var det = r[0] || {}, cut = r[1];
      var st = det.stats || {}, pd = det.player || {}, hist = det.history || [];
      var elo = st.currentElo != null ? st.currentElo : (hist.length ? hist[hist.length - 1].elo : null);
      var unrated = (st.unrated != null ? !!st.unrated : (hist.length === 0)) || elo == null;
      var wins = st.totalW, losses = st.totalL;
      var matches = st.totalMatches != null ? st.totalMatches : hist.reduce(function (a, h) { return a + (h.w || 0) + (h.l || 0); }, 0);
      var recent = hist.slice(-6).reverse();
      var display = pd.displayName || name;
      var photo = pd.photoUrl || "";
      var region = pd.region || "";
      var gender = String(pd.gender || "").toUpperCase() === "F" ? "Female" : (pd.gender ? "Male" : "");
      var ig = String(pd.ig || "").replace(/^@+/, "");
      var calibrated = !unrated && matches >= 15;
      var mine = S.myName && norm(name) === norm(S.myName);

      function infoRow(label, val) { return '<div class="inforow"><span class="il">' + label + '</span><span class="iv">' + val + '</span></div>'; }
      var info = "";
      if (region) info += infoRow("Region", esc(region));
      if (gender) info += infoRow("Gender", esc(gender));
      if (ig) info += infoRow("Instagram", '<a href="https://instagram.com/' + esc(ig) + '" target="_blank" rel="noopener" style="color:var(--or);font-weight:700;text-decoration:none">@' + esc(ig) + '</a>');

      viewEl().innerHTML = '<div class="screen">' +
        '<button class="link" id="back" style="padding-left:0">‹ Back</button>' +
        '<div class="p-top"><div><div class="p-hi">Player</div>' +
          '<div class="p-name" style="display:flex;align-items:center;gap:7px">' + esc(display) + (mine ? " · you" : "") + (unrated ? "" : checkBadge(calibrated)) + '</div>' +
          (region ? '<div class="p-meta">' + esc(region) + '</div>' : "") + '</div>' +
          '<div class="ava" style="width:52px;height:52px;font-size:19px">' + (photo ? '<img src="' + esc(photo) + '" alt=""/>' : esc(initials(display))) + '</div></div>' +
        '<div class="hero">' + (unrated
          ? '<p class="lbl">ELO Rating</p><p class="num" style="font-size:34px">Unrated</p>'
          : '<p class="lbl">ELO Rating</p><p class="num">' + elo + '</p><span class="tier">🏆 ' + esc(API.tierName(elo, cut)) + '</span>') + '</div>' +
        '<div class="statrow"><div class="stat"><b>' + (wins != null ? wins : "–") + '</b><span>Wins</span></div>' +
          '<div class="stat"><b>' + (losses != null ? losses : "–") + '</b><span>Losses</span></div>' +
          '<div class="stat"><b>' + (matches != null ? matches : "–") + '</b><span>Matches</span></div></div>' +
        (info ? '<div class="sec">About</div><div class="plain" style="padding:6px 14px">' + info + '</div>' : "") +
        (mine ? "" : '<button class="btn ghost soon" id="challenge" style="margin-top:6px">Challenge ' + esc(display.split(" ")[0]) + '</button>') +
        (recent.length ? '<div class="sec">Recent ELO</div>' + recent.map(function (h) {
          var up = (h.delta || 0) >= 0;
          return '<div class="hitem"><span class="d">' + esc(fmtDate(h.timestamp)) + '</span><span class="e">' + h.elo + '</span><span class="' + (up ? "up" : "dn") + '">' + (up ? "▲ +" : "▼ ") + Math.abs(h.delta || 0) + '</span></div>';
        }).join("") : "") +
        '</div>';
      d.getElementById("back").onclick = function () { S.view = "rankings"; refreshTabbar(); renderView(); };
      var ch = d.getElementById("challenge"); if (ch) ch.onclick = function () { toast("Challenge players — coming soon 🔜"); };
    } catch (e) {
      viewEl().innerHTML = errorBox("Couldn't load this player.", function () { renderPlayerProfile(); });
    }
  }

  /* ---------- PLAY (sessions + events) ---------- */
  // Trekkr Championship / Series figures — mirrors /wave1/config.js (single source
  // of truth). Loaded live when available; this is the offline fallback.
  var LIGA_FALLBACK = {
    championship: { date: "2026-12-13", city: "Jakarta", prizePool: 30000000,
      prizes: [{ tier: "T1", label: "Open", amount: 15000000 }, { tier: "T2", label: "Contender", amount: 10000000 }, { tier: "T3", label: "Rising", amount: 5000000 }] },
    series: { prizePool: 9000000, minEntered: 2, dates: [
      { iso: "2026-09-14", label: "14 Sep", name: "Series #1", venue: "The Field" },
      { iso: "2026-10-12", label: "12 Oct", name: "Series #2", venue: "The Field" },
      { iso: "2026-11-09", label: "9 Nov", name: "Series #3", venue: "The Field" }] },
    qualifying: { close: "2026-11-30", topN: 16 },
  };
  var _liga = null;
  // Prefer the server-managed Liga config (superadmin → Liga), so prize pools,
  // dates & venues match the web. Fall back to the static wave1 config.js, then
  // the inlined LIGA_FALLBACK, if the API is unavailable.
  function ligaStaticFallback() {
    if (w.TREKKR) { _liga = w.TREKKR; return Promise.resolve(_liga); }
    return new Promise(function (res) {
      var s = d.createElement("script"); s.src = "/wave1/config.js";
      s.onload = function () { _liga = w.TREKKR || LIGA_FALLBACK; res(_liga); };
      s.onerror = function () { _liga = LIGA_FALLBACK; res(_liga); };
      d.head.appendChild(s);
    });
  }
  function ligaConfig() {
    if (_liga) return Promise.resolve(_liga);
    return fetch(API.base + "/liga/config").then(function (r) { return r.json(); }).then(function (dd) {
      if (!dd || !dd.config) throw 0;
      _liga = Object.assign({}, (w.TREKKR || LIGA_FALLBACK), dd.config);
      return _liga;
    }).catch(function () { return ligaStaticFallback(); });
  }
  function rp(n) { return "Rp" + Number(n || 0).toLocaleString("id-ID"); }
  function daysTo(iso) { var t = Date.parse(iso); if (isNaN(t)) return null; return Math.max(0, Math.ceil((t - Date.now()) / 86400000)); }

  // PlayRank tab = a directory of venues / communities running PlayRank. Filter
  // by region, then see each venue's schedule and open its RECLUB / booking link.
  // Schedule + link come from Venue Admin → Venue Info.
  var _rpVenues = null, _rpRegion = "__ALL__";
  function rpVenueLink(v) {
    var u = String((v.reclubUrl || v.contact || "")).trim();
    if (u && !/^https?:\/\//i.test(u)) { u = /^www\./i.test(u) ? "https://" + u : ""; } // ignore non-URL handles
    return u || String(v.registerUrl || "").trim();
  }
  function rpRegionOf(v) { return (v.region || "").trim() || "Other"; }
  function rpVenueCard(v) {
    var link = rpVenueLink(v);
    var loc = (v.location || "").trim();
    var sched = (v.schedule || "").trim();
    var logo = v.logoUrl
      ? '<span class="rp-logo"><img src="' + esc(v.logoUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.textContent=\'' + esc((v.name || "?").slice(0, 1).toUpperCase()) + '\'"/></span>'
      : '<span class="rp-logo">' + esc((v.name || "?").slice(0, 1).toUpperCase()) + '</span>';
    // Left: this venue/community's Trekkr page (weekly ranking); right: booking.
    var vpage = 'https://venue.trekkr.online/' + String(v.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    var btns = '<div class="rp-btns">' +
      '<a class="btn ghost rp-btn" href="' + esc(vpage) + '" target="_blank" rel="noopener">Venue page</a>' +
      (link
        ? '<a class="btn rp-btn" href="' + esc(link) + '" target="_blank" rel="noopener">Book / info →</a>'
        : '<span class="rp-nolink rp-btn">Booking soon</span>') +
      '</div>';
    return '<div class="plain rp-card">' +
      '<div class="rp-head">' + logo +
        '<div class="rp-hb"><h3>' + esc(v.name || "Venue") + (v.featured ? ' <span class="rp-star">★</span>' : "") + '</h3>' +
        (loc ? '<div class="rp-loc">' + esc(loc) + '</div>' : "") + '</div></div>' +
      '<div class="rp-sched"><span class="rp-ico">🗓️</span><span>' + esc(sched || "Schedule coming soon") + '</span></div>' +
      btns + '</div>';
  }
  function renderRpList() {
    var box = d.getElementById("rp-list");
    if (!box) return;
    var vs = (_rpVenues || []).filter(function (v) { return !v.hidden && v.name; });
    if (_rpRegion !== "__ALL__") vs = vs.filter(function (v) { return rpRegionOf(v) === _rpRegion; });
    vs.sort(function (a, b) {
      if (!!b.featured !== !!a.featured) return b.featured ? 1 : -1;
      var ao = a.sortOrder == null ? 9999 : a.sortOrder, bo = b.sortOrder == null ? 9999 : b.sortOrder;
      if (ao !== bo) return ao - bo;
      return String(a.name).localeCompare(String(b.name));
    });
    box.innerHTML = vs.length
      ? vs.map(rpVenueCard).join("")
      : '<div class="plain"><h3>No venues in this region yet</h3><p>Try another region, or check back soon — new PlayRank venues are added regularly.</p></div>';
  }
  async function renderMain() {
    viewEl().innerHTML = '<div class="screen"><h1 class="page">PlayRank</h1><div class="center" style="min-height:36vh"><div class="spinner"></div></div></div>';
    try {
      if (!_rpVenues) {
        var res = await API.getVenues();
        _rpVenues = (res && res.venues) || [];
      }
      var regions = {};
      _rpVenues.forEach(function (v) { if (!v.hidden && v.name) regions[rpRegionOf(v)] = true; });
      var regionList = Object.keys(regions).sort(function (a, b) {
        if (a === "Other") return 1; if (b === "Other") return -1; return a.localeCompare(b);
      });
      if (_rpRegion !== "__ALL__" && regionList.indexOf(_rpRegion) < 0) _rpRegion = "__ALL__";
      var opts = '<option value="__ALL__">All regions</option>' +
        regionList.map(function (rg) { return '<option value="' + esc(rg) + '"' + (rg === _rpRegion ? " selected" : "") + '>' + esc(rg) + '</option>'; }).join("");

      viewEl().innerHTML = '<div class="screen"><h1 class="page">PlayRank</h1>' +
        '<p class="lede">Venues &amp; communities running PlayRank near you. Pick a region to see schedules and book.</p>' +
        '<div class="rp-filter"><label class="rp-flabel">Region</label>' +
          '<div class="rp-select"><select id="rp-region">' + opts + '</select></div></div>' +
        '<div id="rp-list" style="margin-top:12px"></div>' +
        '</div>';
      renderRpList();
      var sel = d.getElementById("rp-region");
      if (sel) sel.onchange = function () { _rpRegion = sel.value; renderRpList(); };
    } catch (e) {
      viewEl().innerHTML = errorBox("Couldn't load PlayRank venues.", renderMain);
    }
  }

  /* ---------- PROFILE ---------- */
  async function renderProfil() {
    viewEl().innerHTML = '<div class="screen"><div class="center" style="min-height:30vh"><div class="spinner"></div></div></div>';
    try {
      var me = await ensureMe();
      var name = (me.player && (me.player.displayName || me.player.name)) || "—";
      viewEl().innerHTML = '<div class="screen">' +
        '<h1 class="page">Profile</h1>' +
        '<div class="plain"><h3>' + esc(name) + '</h3><p>' + esc(me.email || "") + '</p></div>' +
        '<button class="plain" id="edit" style="width:100%;text-align:left;border:1px solid var(--line)"><h3>✏️ Edit profile</h3><p>Display name, photo, IG, region &amp; password.</p></button>' +
        '<button class="plain" id="howto" style="width:100%;text-align:left;border:1px solid var(--line)"><h3>🧭 How to get ranked</h3><p>ELO, tiers &amp; how to climb.</p></button>' +
        '<div class="plain" style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><h3>Appearance</h3><p>Toggle dark / light mode.</p></div>' + themeBtnHTML("pf-theme") + '</div>' +
        '<button class="btn ghost" id="logout" style="margin-top:16px">Sign out</button>' +
        '</div>';
      wireThemeBtn("pf-theme");
      d.getElementById("logout").onclick = function () { sb.auth.signOut(); };
      d.getElementById("edit").onclick = function () { S.view = "edit"; refreshTabbar(); renderView(); w.scrollTo(0, 0); };
      d.getElementById("howto").onclick = function () { S.prev = "profil"; S.view = "ranked-info"; refreshTabbar(); renderView(); w.scrollTo(0, 0); };
    } catch (e) { viewEl().innerHTML = errorBox("Couldn't load your profile.", renderProfil); }
  }

  /* ---------- EDIT PROFILE ---------- */
  function resizePhoto(file) {
    return new Promise(function (res, rej) {
      if (!/^image\//.test(file.type)) return rej(new Error("Not an image"));
      var r = new FileReader();
      r.onload = function () {
        var im = new Image();
        im.onload = function () {
          var M = 512, s = Math.min(1, M / Math.max(im.width, im.height));
          var w2 = Math.round(im.width * s), h2 = Math.round(im.height * s);
          var cv = d.createElement("canvas"); cv.width = w2; cv.height = h2;
          cv.getContext("2d").drawImage(im, 0, 0, w2, h2);
          res(cv.toDataURL("image/jpeg", 0.85));
        };
        im.onerror = rej; im.src = r.result;
      };
      r.onerror = rej; r.readAsDataURL(file);
    });
  }
  async function renderEditProfile() {
    viewEl().innerHTML = '<div class="screen"><button class="link" id="back" style="padding-left:0">‹ Back</button><div class="center" style="min-height:30vh"><div class="spinner"></div></div></div>';
    d.getElementById("back").onclick = function () { S.view = "profil"; refreshTabbar(); renderView(); };
    var newPhoto = null;
    try {
      var me = await ensureMe();
      var p = me.player || {};
      if (!p.name) return renderProfil();
      var curPhoto = p.photo_url || p.photoUrl || "";
      var gM = (String(p.gender || "M").toUpperCase() === "F") ? "" : "selected";
      var gF = (String(p.gender || "M").toUpperCase() === "F") ? "selected" : "";
      var pending = (me && me.pendingName) ? String(me.pendingName) : "";
      var aliasVal = (p.displayName && normName(p.displayName) !== normName(p.name)) ? p.displayName : "";
      viewEl().innerHTML = '<div class="screen">' +
        '<button class="link" id="back" style="padding-left:0">‹ Back</button>' +
        '<h1 class="page" style="margin-top:4px">Edit profile</h1>' +
        '<div class="field"><label class="label">Photo</label><div style="display:flex;align-items:center;gap:14px">' +
          '<div class="ava" id="pv" style="width:62px;height:62px;border-radius:14px">' + (curPhoto ? '<img src="' + esc(curPhoto) + '" alt=""/>' : esc(initials(aliasVal || p.name))) + '</div>' +
          '<label class="btn ghost" style="width:auto;padding:10px 14px;margin:0">Upload<input type="file" id="photo" accept="image/*" style="display:none"></label></div></div>' +

        '<div class="sec" style="margin-top:24px">Full name' + (pending ? '<span class="pendtag">Pending review</span>' : '') + '</div>' +
        '<div class="field"><input class="input" id="fname" value="' + esc(p.name) + '"' + (pending ? ' disabled' : '') + '/></div>' +
        '<div class="fhint">Your full name is your unique Trekkr identity — every match and ELO point is recorded to it. Editing it needs a quick admin review before it takes effect.</div>' +
        (pending
          ? '<div class="msg ok" style="margin-top:10px">Name change pending review — you asked to change it to “' + esc(pending) + '”. Your current name stays until an admin approves.</div>'
          : '<div class="msg err hidden" id="nerr"></div><button class="btn ghost" id="savename" style="margin-top:10px">Request name change</button>') +

        '<div class="sec" style="margin-top:26px">Public profile</div>' +
        '<div class="field"><label class="label">Alias (nickname)</label><input class="input" id="dname" placeholder="e.g. your first name" value="' + esc(aliasVal) + '"/></div>' +
        '<div class="fhint">This is the name shown on the public leaderboard and your passport. Leave it blank to use your first name. Change it anytime — no review needed.</div>' +
        '<div class="field"><label class="label">Instagram</label><input class="input" id="ig" placeholder="username" value="' + esc(String(p.ig || "").replace(/^@+/, "")) + '"/></div>' +
        '<div class="field"><label class="label">Region / City</label><input class="input" id="region" placeholder="e.g. Jakarta" value="' + esc(p.region || "") + '"/></div>' +
        '<div class="field"><label class="label">Gender</label><select class="input" id="gender"><option value="M" ' + gM + '>Male</option><option value="F" ' + gF + '>Female</option></select></div>' +
        '<div class="msg err hidden" id="perr"></div>' +
        '<button class="btn" id="save">Save changes</button>' +
        '<div class="sec" style="margin-top:26px">Change password</div>' +
        '<div class="field"><label class="label">New password</label><input class="input" id="np" type="password" placeholder="Min 6 characters" autocomplete="new-password"/></div>' +
        '<div class="field"><label class="label">Confirm password</label><input class="input" id="np2" type="password" autocomplete="new-password"/></div>' +
        '<div class="msg err hidden" id="pwerr"></div>' +
        '<button class="btn ghost" id="savepw">Update password</button>' +
        '</div>';
      d.getElementById("back").onclick = function () { S.view = "profil"; refreshTabbar(); renderView(); };
      d.getElementById("photo").addEventListener("change", async function (e) {
        var f = e.target.files && e.target.files[0]; if (!f) return;
        try { newPhoto = await resizePhoto(f); d.getElementById("pv").innerHTML = '<img src="' + newPhoto + '" alt=""/>'; }
        catch (err) { toast("Please pick an image file"); }
        e.target.value = "";
      });
      var saveBtn = d.getElementById("save");
      saveBtn.onclick = async function () {
        var err = d.getElementById("perr"); err.classList.add("hidden");
        var updates = {
          display_name: (d.getElementById("dname").value || "").trim(),
          ig: (d.getElementById("ig").value || "").trim().replace(/^@+/, ""),
          region: (d.getElementById("region").value || "").trim(),
          gender: d.getElementById("gender").value || "M",
        };
        if (newPhoto) updates.photo = newPhoto;
        saveBtn.disabled = true; saveBtn.textContent = "Saving…";
        try {
          await API.updateProfile(S.token, updates);
          S.me = null; await ensureMe();
          toast("Profile saved ✓");
          S.view = "profil"; refreshTabbar(); renderView();
        } catch (e2) {
          err.textContent = e2.message || "Couldn't save."; err.classList.remove("hidden");
          saveBtn.disabled = false; saveBtn.textContent = "Save changes";
        }
      };
      var saveName = d.getElementById("savename");
      if (saveName) saveName.onclick = async function () {
        var ne = d.getElementById("nerr"); ne.classList.add("hidden");
        var nn = (d.getElementById("fname").value || "").trim();
        if (nn.length < 2) { ne.textContent = "Please enter your full name."; ne.classList.remove("hidden"); return; }
        if (normName(nn) === normName(p.name)) { ne.textContent = "That's already your name."; ne.classList.remove("hidden"); return; }
        saveName.disabled = true; saveName.textContent = "Sending…";
        try {
          await API.requestNameChange(S.token, nn);
          S.me = null; await ensureMe();
          toast("Sent for review ✓");
          renderEditProfile();
        } catch (e2) {
          ne.textContent = e2.message || "Couldn't send the request."; ne.classList.remove("hidden");
          saveName.disabled = false; saveName.textContent = "Request name change";
        }
      };
      var savePw = d.getElementById("savepw");
      savePw.onclick = async function () {
        var e1 = d.getElementById("pwerr"); e1.classList.add("hidden");
        var np = d.getElementById("np").value || "", np2 = d.getElementById("np2").value || "";
        if (np.length < 6) { e1.textContent = "Password must be at least 6 characters."; e1.classList.remove("hidden"); return; }
        if (np !== np2) { e1.textContent = "Passwords don't match."; e1.classList.remove("hidden"); return; }
        savePw.disabled = true; savePw.textContent = "Updating…";
        try {
          await API.changePassword(S.token, np);
          d.getElementById("np").value = ""; d.getElementById("np2").value = "";
          toast("Password updated ✓");
        } catch (e2) { e1.textContent = e2.message || "Couldn't update password."; e1.classList.remove("hidden"); }
        savePw.disabled = false; savePw.textContent = "Update password";
      };
    } catch (e) {
      viewEl().innerHTML = errorBox("Couldn't load the editor.", function () { renderEditProfile(); });
    }
  }

  /* ---------- HOW TO GET RANKED (education) ---------- */
  async function renderRankedInfo() {
    var cut = await ensureCut();
    var t1 = (cut && cut.t1) || 2000, t2 = (cut && cut.t2) || 1500;
    function row(a, b2) { return '<tr><td>' + a + '</td><td class="r">' + b2 + '</td></tr>'; }
    viewEl().innerHTML = '<div class="screen">' +
      '<button class="link" id="back" style="padding-left:0">‹ Back</button>' +
      '<h1 class="page" style="margin-top:4px">How to get ranked</h1>' +
      '<div class="plain"><h3>3 steps</h3><p>1 · Register or claim your profile.<br>2 · Play at a PlayRank session / partner venue — the host records results and your ELO is computed automatically.<br>3 · After 15+ matches (calibration done), your official rating &amp; Series Tier appear.</p></div>' +
      '<div class="plain"><h3>What is ELO?</h3><p>A strength number that goes up/down each match based on your opponents and the score margin. Beating stronger opponents or winning big moves you up more. During calibration (your first 15 matches) it moves faster.</p></div>' +
      '<div class="plain"><h3>Skill ladder — ELO Tier</h3>' +
        '<table class="ttable"><tr><th>Tier</th><th class="r">ELO</th></tr>' +
        row("Beginner", "< 900") + row("Upper Beginner", "900–1199") + row("Lower Bronze", "1200–1499") +
        row("Bronze", "1500–1799") + row("Upper Bronze", "1800–2099") + row("Silver", "2100–2499") +
        row("Gold", "2500–2999") + row("Platinum", "≥ 3000") + '</table></div>' +
      '<div class="plain"><h3>Competitive divisions — T1 / T2 / T3</h3>' +
        '<p>Used for Trekkr Series &amp; League. Set by your position among active players (percentile), so the cutoffs shift and are recomputed periodically. <b>T1 is Open.</b></p>' +
        '<table class="ttable" style="margin-top:10px"><tr><th>Tier</th><th>Current cutoff</th><th>≈ level</th></tr>' +
        '<tr><td style="font-weight:800;color:var(--or)">T1 · Open</td><td>ELO ≥ ' + t1 + '</td><td>Bronze+</td></tr>' +
        '<tr><td style="font-weight:800">T2</td><td>' + t2 + '–' + (t1 - 1) + '</td><td>Lower Bronze</td></tr>' +
        '<tr><td style="font-weight:800">T3</td><td>&lt; ' + t2 + '</td><td>Beginner–L.Bronze</td></tr>' +
        '</table>' +
        '<p style="margin-top:10px;font-size:12px;color:var(--faint)">The Bronze mapping is just an easy reference — not the rule; it shifts as the population changes.</p></div>' +
      '</div>';
    d.getElementById("back").onclick = function () { S.view = S.prev || "passport"; refreshTabbar(); renderView(); w.scrollTo(0, 0); };
  }

  /* ---------- shared ---------- */
  function errorBox(msg, retry) {
    setTimeout(function () { var b = d.getElementById("retry"); if (b) b.onclick = retry; }, 0);
    return '<div class="screen"><div class="emptybig"><div class="em">⚠️</div><p>' + esc(msg) + '</p>' +
      '<button class="btn ghost" id="retry" style="max-width:200px;margin:14px auto 0">Try again</button></div></div>';
  }

  /* ---------- iOS install hint ---------- */
  function maybeIosHint() {
    if (!isIosSafari()) return;
    try { if (localStorage.getItem("trekkr_ioshint") === "off") return; } catch (e) {}
    var el = d.createElement("div");
    el.className = "ioshint";
    el.innerHTML = '<button class="x" aria-label="Close">×</button>' +
      '<h5>Install Trekkr on your iPhone</h5>' +
      '<p>Tap <b>Share</b> ⬆️ in Safari → <b>Add to Home Screen</b>. Free, no App Store.</p>';
    d.body.appendChild(el);
    el.querySelector(".x").onclick = function () { el.remove(); try { localStorage.setItem("trekkr_ioshint", "off"); } catch (e) {} };
  }

  boot();
})(window, document);
