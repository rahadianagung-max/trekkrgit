/* Trekkr Player PWA — app shell: auth, router, screens. Vanilla JS, no build. */
(function (w, d) {
  "use strict";
  var API = w.TrekkrAPI, sb = API.sb;
  var app = d.getElementById("app");

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
  function isIosSafari() {
    var ua = w.navigator.userAgent;
    var ios = /iPad|iPhone|iPod/.test(ua) && !w.MSStream;
    var standalone = w.navigator.standalone === true || w.matchMedia("(display-mode: standalone)").matches;
    return ios && !standalone;
  }

  /* ---------- boot ---------- */
  function boot() {
    setHTML('<div class="center"><div class="spinner"></div></div>');
    sb.auth.getSession().then(function (r) {
      S.session = r.data.session; S.token = S.session ? S.session.access_token : null;
      render();
    });
    sb.auth.onAuthStateChange(function (_e, session) {
      S.session = session; S.token = session ? session.access_token : null;
      S.me = null; S.myName = ""; S.card = null;
      render();
    });
  }
  function render() { if (!S.session) return renderLogin(); renderShell(); }

  /* ---------- LOGIN ---------- */
  function renderLogin() {
    setHTML(
      '<div class="login-wrap">' +
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
  function renderShell() { setHTML('<div id="view"></div>' + tabbarHTML()); bindTabs(); renderView(); }
  function tabbarHTML() {
    var tabs = [["passport", "🎾", "Passport"], ["rankings", "🏆", "Rankings"], ["main", "📅", "Play"], ["profil", "👤", "Profile"]];
    var active = (S.view === "ranked-info") ? "profil" : S.view;
    return '<nav class="tabbar">' + tabs.map(function (t) {
      return '<button class="tab' + (t[0] === active ? " on" : "") + '" data-tab="' + t[0] + '"><span class="ic">' + t[1] + '</span>' + t[2] + '</button>';
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
    if (S.view === "passport") return renderPassport();
    if (S.view === "rankings") return renderRankings();
    if (S.view === "main") return renderMain();
    if (S.view === "profil") return renderProfil();
    if (S.view === "ranked-info") return renderRankedInfo();
  }

  async function ensureMe() { if (!S.me) S.me = await API.accountMe(S.token); S.myName = (S.me && S.me.player && S.me.player.name) || ""; return S.me; }
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
        API.getEloHistory(name).catch(function () { return { history: [] }; }),
        ensureCut(),
      ]);
      var det = r[0] || {}, hist = (r[1] && r[1].history) || [], cut = r[2];
      var elo = det.currentElo != null ? det.currentElo : (det.elo != null ? det.elo : (me.player.elo != null ? me.player.elo : (hist.length ? hist[hist.length - 1].elo : null)));
      var unrated = !!det.unrated || elo == null;
      var wins = det.wins != null ? det.wins : det.totalWins;
      var losses = det.losses != null ? det.losses : det.totalLosses;
      var matches = det.totalMatches != null ? det.totalMatches : (det.matches != null ? det.matches : hist.reduce(function (a, h) { return a + (h.w || 0) + (h.l || 0); }, 0));
      var last = hist.length ? hist[hist.length - 1] : null;
      var recent = hist.slice(-8).reverse();
      var display = det.displayName || me.player.displayName || name;
      var photo = det.photoUrl || me.player.photo_url || me.player.photoUrl || "";
      var region = det.region || me.player.region || "";
      var club = ((det.clubs || me.player.clubs || "").split(",")[0] || "").trim();
      var tier = unrated ? null : API.tierName(elo, cut);

      S.card = { display: display, name: name, elo: elo, tier: tier, wins: wins, losses: losses, matches: matches, unrated: unrated, photo: photo, region: region, slug: slug(name) };

      var heroInner = unrated
        ? '<p class="lbl">ELO Rating</p><p class="num" style="font-size:34px">Unrated</p><p style="margin:6px 0 0;font-size:12.5px;opacity:.92">Your rating appears after your first PlayRank match</p>'
        : '<p class="lbl">ELO Rating</p><p class="num">' + elo + '</p>' +
          '<span class="tier">🏆 ' + esc(tier) + '</span>' +
          (last && last.delta ? '<span class="delta">' + (last.delta >= 0 ? "▲ +" : "▼ ") + Math.abs(last.delta) + '</span>' : "");

      var calib = (!unrated && matches < 15)
        ? '<div class="calib"><b>Calibrating:</b> ' + Math.max(0, 15 - matches) + ' more matches until your tier is set. Your ELO moves faster during this window.</div>'
        : "";

      viewEl().innerHTML =
        '<div class="screen">' +
          '<div class="p-top"><div><div class="p-hi">Passport</div><div class="p-name">' + esc(display) + '</div>' +
            (region || club ? '<div class="p-meta">' + esc([region, club].filter(Boolean).join(" · ")) + '</div>' : "") + '</div>' +
            '<div class="ava">' + (photo ? '<img src="' + esc(photo) + '" alt=""/>' : esc(initials(display))) + '</div></div>' +
          '<div class="hero">' + heroInner + '</div>' +
          calib +
          '<div class="statrow"><div class="stat"><b>' + (wins != null ? wins : "–") + '</b><span>Wins</span></div>' +
            '<div class="stat"><b>' + (losses != null ? losses : "–") + '</b><span>Losses</span></div>' +
            '<div class="stat"><b>' + (matches != null ? matches : "–") + '</b><span>Matches</span></div></div>' +
          '<div class="actrow"><button class="btn" id="share">Share Card</button>' +
            '<button class="btn ghost soon" id="challenge" style="flex:0 0 auto;width:auto;padding:15px 16px">Challenge</button></div>' +
          (recent.length ? '<div class="sec">Recent ELO</div>' + recent.map(function (h) {
            var up = (h.delta || 0) >= 0;
            return '<div class="hitem"><span class="d">' + esc(fmtDate(h.timestamp)) + '</span><span class="e">' + h.elo + '</span>' +
              '<span class="' + (up ? "up" : "dn") + '">' + (up ? "▲ +" : "▼ ") + Math.abs(h.delta || 0) + '</span></div>';
          }).join("") : "") +
          '<button class="link" id="howto" style="display:block;margin:18px auto 0">How to get ranked ›</button>' +
        '</div>';

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
      var r = await Promise.all([API.getLeaderboard({ limit: 200 }), ensureCut(), ensureMe()]);
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
        return '<div class="rrow' + (rank <= 3 ? " top" : "") + (mine ? " me" : "") + '">' +
          '<span class="rk">' + rank + '</span>' +
          '<span class="who"><span class="nm">' + esc(p.name) + (mine ? " · you" : "") + '</span>' +
          '<span class="mt">' + esc(API.tierName(p.elo, cut)) + (p.region ? " · " + esc(p.region) : "") + '</span></span>' +
          '<span class="el">' + p.elo + '</span></div>';
      }).join("");
      viewEl().innerHTML = '<div class="screen">' +
        '<div class="rtitle">Rankings</div><div class="rsub">Calibrated players (15+ matches) · national</div>' +
        '<div class="chips">' + chips + '</div>' +
        (rows || '<div class="emptybig"><div class="em">🏆</div><p>No players in this filter yet.</p></div>') +
        '</div>';
      Array.prototype.forEach.call(d.querySelectorAll(".chip"), function (c) { c.onclick = function () { S.rankFilter = c.getAttribute("data-f"); renderRankings(); }; });
    } catch (e) { viewEl().innerHTML = errorBox("Couldn't load rankings.", renderRankings); }
  }

  /* ---------- PLAY (placeholder) ---------- */
  function renderMain() {
    viewEl().innerHTML = '<div class="screen">' +
      '<h1 class="page">Play</h1>' +
      '<div class="emptybig"><div class="em">📅</div>' +
      '<p style="max-width:34ch;margin:12px auto 0">PlayRank sessions &amp; events will show up here. The <b>Register</b> button opens the link set by the venue admin per event.</p>' +
      '<p style="color:var(--faint);font-size:12.5px;margin-top:10px">Coming soon.</p></div></div>';
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
        '<button class="plain" id="howto" style="width:100%;text-align:left;border:1px solid var(--line)"><h3>🧭 How to get ranked</h3><p>ELO, tiers &amp; how to climb.</p></button>' +
        '<a class="plain" style="display:block;text-decoration:none" href="https://trekkr.online/player/' + slug((me.player && me.player.name) || "") + '" target="_blank" rel="noopener"><h3>✏️ Edit profile (web)</h3><p>Change display name, photo, IG, region.</p></a>' +
        '<a class="plain" style="display:block;text-decoration:none" href="https://trekkr.online/reset" target="_blank" rel="noopener"><h3>🔑 Change password</h3><p>Via the password reset link.</p></a>' +
        '<button class="btn ghost" id="logout" style="margin-top:16px">Sign out</button>' +
        '</div>';
      d.getElementById("logout").onclick = function () { sb.auth.signOut(); };
      d.getElementById("howto").onclick = function () { S.prev = "profil"; S.view = "ranked-info"; refreshTabbar(); renderView(); w.scrollTo(0, 0); };
    } catch (e) { viewEl().innerHTML = errorBox("Couldn't load your profile.", renderProfil); }
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
