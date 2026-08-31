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
  function fmtDate(ts) { var x = new Date(ts); return isNaN(x) ? "—" : x.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
  function slug(n) { return String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function norm(n) { return String(n || "").trim().toLowerCase(); }
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
      out.push({ res: res, sf: sf, sa: sa, partner: partner, opps: opps, date: m.date || "", ts: ts });
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
  function boot() {
    setHTML('<div class="center"><div class="spinner"></div></div>');
    sb.auth.getSession().then(function (r) {
      S.session = r.data.session; S.token = S.session ? S.session.access_token : null;
      // The splash stays as an interactive welcome screen; the user taps Play Now.
      S.view = "welcome";
      render();
      hideSplash();
    });
    sb.auth.onAuthStateChange(function (_e, session) {
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
    renderShell();
  }

  /* ---------- WELCOME ---------- */
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
          '<li><span class="wc-ic">📈</span><div><b>Live ELO &amp; tier</b><span>Watch your rating move after every match.</span></div></li>' +
          '<li><span class="wc-ic">🏆</span><div><b>National rankings</b><span>See where you stand across Indonesia.</span></div></li>' +
          '<li><span class="wc-ic">🎾</span><div><b>Play &amp; events</b><span>Find PlayRank sessions and tournaments near you.</span></div></li>' +
        '</ul>' +
        '<div class="wc-cta">' +
          '<button class="btn" id="wc-start">Play Now</button>' +
          (signedIn ? '' : '<button class="link" id="wc-guest">Browse as guest</button>') +
        '</div>' +
      '</div>'
    );
    maybeIosHint();
    wireThemeBtn("wc-theme-btn");
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
          '<a class="link" href="https://trekkr.online/join" target="_blank" rel="noopener">No account yet? Register / claim</a><br>' +
          '<a class="link" href="https://trekkr.online/reset" target="_blank" rel="noopener" style="color:var(--faint)">Forgot password?</a>' +
        '</div>' +
      '</div>'
    );
    maybeIosHint();
    d.getElementById("lback").onclick = function () { S.view = "rankings"; render(); };
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
    // Profile → person
    profil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.4-3.6 3.4-6 7.2-6s6.8 2.4 7.2 6"/></svg>',
  };
  function tabbarHTML() {
    var tabs = [["passport", "Passport"], ["rankings", "Rankings"], ["main", "Play"], ["profil", "Profile"]];
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
          spark +
          '<div class="actrow"><button class="btn" id="share">Share Card</button>' +
            '<button class="btn ghost soon" id="challenge" style="flex:0 0 auto;width:auto;padding:15px 16px">Challenge</button></div>' +
          recentHTML +
          '<button class="link" id="howto" style="display:block;margin:18px auto 0">How to get ranked ›</button>' +
        '</div>';

      wireThemeBtn("pp-theme");
      d.getElementById("pp-av").onclick = function () { S.view = "edit"; refreshTabbar(); renderView(); w.scrollTo(0, 0); };
      d.getElementById("challenge").onclick = function () { toast("Challenge players — coming soon 🔜"); };
      d.getElementById("share").onclick = shareCard;
      d.getElementById("howto").onclick = function () { S.prev = "passport"; S.view = "ranked-info"; refreshTabbar(); renderView(); w.scrollTo(0, 0); };
    } catch (e) {
      viewEl().innerHTML = errorBox("Couldn't load your passport.", renderPassport);
    }
  }
  function passportNoPlayer(me) {
    viewEl().innerHTML = '<div class="screen"><div class="emptybig"><div class="em">🔗</div>' +
      '<h1 class="page" style="margin-top:14px">Not linked yet</h1>' +
      '<p style="color:var(--mu);font-size:14px;line-height:1.6">This account (' + esc(me.email || "") + ') isn\'t linked to a player profile yet. Claim your profile on the web, then wait for admin approval.</p>' +
      '<a class="btn" style="display:block;margin-top:18px;text-decoration:none;text-align:center" href="https://trekkr.online/join" target="_blank" rel="noopener">Claim on the web</a></div></div>';
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
    try {
      var r = await Promise.all([API.getLeaderboard({ limit: 200 }), ensureCut(), ensureMe().catch(function () { return null; })]);
      var list = (r[0] && r[0].leaderboard) || [], cut = r[1];
      list = list.filter(function (p) { return (Number(p.totalMatches) || 0) >= 15; })
        .map(function (p) { return { name: p.name, elo: Number(p.elo) || 0, region: p.region }; })
        .sort(function (a, b) { return b.elo - a.elo; });
      function tierOf(elo) { return elo >= ((cut && cut.t1) || 2000) ? "T1" : elo >= ((cut && cut.t2) || 1500) ? "T2" : "T3"; }
      var f = S.rankFilter;
      var chips = [["all", "All"], ["T1", "T1"], ["T2", "T2"], ["T3", "T3"]].map(function (c) {
        return '<button class="chip' + (f === c[0] ? " on" : "") + '" data-f="' + c[0] + '">' + c[1] + '</button>';
      }).join("");
      var rows = list.filter(function (p) { return f === "all" || tierOf(p.elo) === f; }).map(function (p) {
        var rank = list.indexOf(p) + 1;
        var mine = S.myName && norm(p.name) === norm(S.myName);
        return '<div class="rrow' + (rank <= 3 ? " top" : "") + (mine ? " me" : "") + '" data-name="' + esc(p.name) + '" role="button">' +
          '<span class="rk">' + rank + '</span>' +
          '<span class="who"><span class="nm">' + esc(p.name) + (mine ? " · you" : "") + '</span>' +
          '<span class="mt">' + esc(API.tierName(p.elo, cut)) + (p.region ? " · " + esc(p.region) : "") + '</span></span>' +
          '<span class="el">' + p.elo + '</span><span class="rchev">›</span></div>';
      }).join("");
      viewEl().innerHTML = '<div class="screen">' +
        '<div class="rtitle">Rankings</div><div class="rsub">Calibrated players (15+ matches) · national</div>' +
        '<div class="chips">' + chips + '</div>' +
        (rows || '<div class="emptybig"><div class="em">🏆</div><p>No players in this filter yet.</p></div>') +
        '</div>';
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
        API.getEloHistory(name).catch(function () { return { history: [] }; }),
        ensureCut(),
      ]);
      var det = r[0] || {}, hist = (r[1] && r[1].history) || [], cut = r[2];
      var elo = det.currentElo != null ? det.currentElo : (det.elo != null ? det.elo : (hist.length ? hist[hist.length - 1].elo : null));
      var unrated = !!det.unrated || elo == null;
      var wins = det.wins != null ? det.wins : det.totalWins;
      var losses = det.losses != null ? det.losses : det.totalLosses;
      var matches = det.totalMatches != null ? det.totalMatches : (det.matches != null ? det.matches : hist.reduce(function (a, h) { return a + (h.w || 0) + (h.l || 0); }, 0));
      var recent = hist.slice(-6).reverse();
      var display = det.displayName || name;
      var photo = det.photoUrl || "";
      var region = det.region || "";
      var mine = S.myName && norm(name) === norm(S.myName);

      viewEl().innerHTML = '<div class="screen">' +
        '<button class="link" id="back" style="padding-left:0">‹ Back</button>' +
        '<div class="p-top"><div><div class="p-hi">Player</div><div class="p-name">' + esc(display) + (mine ? " · you" : "") + '</div>' +
          (region ? '<div class="p-meta">' + esc(region) + '</div>' : "") + '</div>' +
          '<div class="ava">' + (photo ? '<img src="' + esc(photo) + '" alt=""/>' : esc(initials(display))) + '</div></div>' +
        '<div class="hero">' + (unrated
          ? '<p class="lbl">ELO Rating</p><p class="num" style="font-size:34px">Unrated</p>'
          : '<p class="lbl">ELO Rating</p><p class="num">' + elo + '</p><span class="tier">🏆 ' + esc(API.tierName(elo, cut)) + '</span>') + '</div>' +
        '<div class="statrow"><div class="stat"><b>' + (wins != null ? wins : "–") + '</b><span>Wins</span></div>' +
          '<div class="stat"><b>' + (losses != null ? losses : "–") + '</b><span>Losses</span></div>' +
          '<div class="stat"><b>' + (matches != null ? matches : "–") + '</b><span>Matches</span></div></div>' +
        (mine ? "" : '<button class="btn ghost soon" id="challenge" style="margin-top:14px">Challenge ' + esc(display.split(" ")[0]) + '</button>') +
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
  async function renderMain() {
    viewEl().innerHTML = '<div class="screen"><h1 class="page">Play</h1><div class="center" style="min-height:36vh"><div class="spinner"></div></div></div>';
    try {
      var r = await Promise.all([
        API.getSchedule({}).catch(function () { return { schedule: [] }; }),
        API.getTrackedEvents().catch(function () { return { events: [] }; }),
      ]);
      var sched = (r[0] && r[0].schedule) || [];
      var events = (r[1] && r[1].events) || [];

      var sessHTML = sched.slice(0, 20).map(function (s) {
        var when = [s.date, s.startTime].filter(Boolean).join(" · ");
        var spots = (s.spotsLeft != null) ? (s.spotsLeft + " spots left") : "";
        var price = s.pricePerPlayer ? ("Rp" + Number(s.pricePerPlayer).toLocaleString("id-ID")) : "";
        var meta = [s.venue || s.area, when].filter(Boolean).join(" · ");
        var sub = [spots, price].filter(Boolean).join(" · ");
        var btn = s.whatsappUrl
          ? '<a class="btn" style="text-decoration:none;text-align:center;margin-top:10px" href="' + esc(s.whatsappUrl) + '" target="_blank" rel="noopener">Register</a>'
          : "";
        return '<div class="plain"><h3>' + esc(s.type || "PlayRank") + (s.venue ? " · " + esc(s.venue) : "") + '</h3>' +
          '<p>' + esc(meta) + (sub ? '<br>' + esc(sub) : "") + '</p>' + btn + '</div>';
      }).join("");

      var evHTML = events.slice(0, 20).map(function (e) {
        var btn = e.url
          ? '<a class="btn ghost" style="text-decoration:none;text-align:center;margin-top:10px" href="' + esc(e.url) + '" target="_blank" rel="noopener">View / Register</a>'
          : "";
        var logo = e.logoUrl ? '<img src="' + esc(e.logoUrl) + '" alt="" style="width:40px;height:40px;border-radius:9px;object-fit:cover;float:right;margin-left:10px"/>' : "";
        return '<div class="plain">' + logo + '<h3>' + esc(e.name) + '</h3>' +
          '<p>' + esc([e.location, e.monthYear].filter(Boolean).join(" · ")) + '</p>' + btn + '</div>';
      }).join("");

      var body = "";
      if (sessHTML) body += '<div class="sec" style="margin-top:2px">PlayRank sessions</div>' + sessHTML;
      if (evHTML) body += '<div class="sec">Events</div>' + evHTML;
      if (!body) body = '<div class="emptybig"><div class="em">📅</div><p style="max-width:32ch;margin:12px auto 0">No upcoming sessions or events yet. Check back soon.</p></div>';

      viewEl().innerHTML = '<div class="screen"><h1 class="page">Play</h1>' + body + '</div>';
    } catch (e) {
      viewEl().innerHTML = errorBox("Couldn't load Play.", renderMain);
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
      viewEl().innerHTML = '<div class="screen">' +
        '<button class="link" id="back" style="padding-left:0">‹ Back</button>' +
        '<h1 class="page" style="margin-top:4px">Edit profile</h1>' +
        '<div class="field"><label class="label">Photo</label><div style="display:flex;align-items:center;gap:14px">' +
          '<div class="ava" id="pv" style="width:62px;height:62px;border-radius:14px">' + (curPhoto ? '<img src="' + esc(curPhoto) + '" alt=""/>' : esc(initials(p.displayName || p.name))) + '</div>' +
          '<label class="btn ghost" style="width:auto;padding:10px 14px;margin:0">Upload<input type="file" id="photo" accept="image/*" style="display:none"></label></div></div>' +
        '<div class="field"><label class="label">Display name</label><input class="input" id="dname" value="' + esc(p.displayName || p.name) + '"/></div>' +
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
        if (!updates.display_name) { err.textContent = "Display name can't be empty."; err.classList.remove("hidden"); return; }
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
