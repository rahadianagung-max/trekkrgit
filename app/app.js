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
    prev: null,         // for back from info
    rankFilter: "all",
  };

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function initials(n) { return (String(n || "").trim().split(/\s+/).map(function (x) { return x[0] || ""; }).slice(0, 2).join("") || "?").toUpperCase(); }
  function fmtDate(ts) { var x = new Date(ts); return isNaN(x) ? "—" : x.toLocaleDateString("id-ID", { day: "numeric", month: "short" }); }
  function slug(n) { return String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function norm(n) { return String(n || "").trim().toLowerCase(); }
  function set(html) { app.innerHTML = html; }
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
    set('<div class="center"><div class="spinner"></div></div>');
    sb.auth.getSession().then(function (r) {
      S.session = r.data.session; S.token = S.session ? S.session.access_token : null;
      render();
    });
    sb.auth.onAuthStateChange(function (_e, session) {
      S.session = session; S.token = session ? session.access_token : null;
      S.me = null; S.myName = "";
      render();
    });
  }

  function render() {
    if (!S.session) return renderLogin();
    renderShell();
  }

  /* ---------- LOGIN ---------- */
  function renderLogin() {
    set(
      '<div class="login-wrap">' +
        '<div class="brand">Trekk<b>r</b></div>' +
        '<p class="sub">Masuk ke akun pemainmu.</p>' +
        '<div class="field"><label class="label">Email</label>' +
          '<input class="input" id="email" type="email" autocomplete="email" placeholder="email@contoh.com"/></div>' +
        '<div class="field"><label class="label">Password</label>' +
          '<input class="input" id="pass" type="password" autocomplete="current-password" placeholder="Password"/></div>' +
        '<div class="msg err hidden" id="err"></div>' +
        '<button class="btn" id="go">Masuk</button>' +
        '<div style="text-align:center;margin-top:16px">' +
          '<a class="link" href="https://trekkr.online/join" target="_blank" rel="noopener">Belum punya akun? Daftar / klaim</a><br>' +
          '<a class="link" href="https://trekkr.online/reset" target="_blank" rel="noopener" style="color:var(--faint)">Lupa password?</a>' +
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
      if (!email || !pass) { err.textContent = "Isi email dan password."; err.classList.remove("hidden"); return; }
      go.disabled = true; go.textContent = "Masuk…";
      var res = await sb.auth.signInWithPassword({ email: email, password: pass });
      if (res.error) {
        err.textContent = /Invalid login/.test(res.error.message) ? "Email atau password salah." : res.error.message;
        err.classList.remove("hidden"); go.disabled = false; go.textContent = "Masuk";
      }
      // success → onAuthStateChange re-renders
    }
    go.onclick = submit;
    d.getElementById("pass").addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  }

  /* ---------- SHELL (tabs) ---------- */
  function renderShell() {
    var body = '<div id="view"></div>' + tabbarHTML();
    set(body);
    bindTabs();
    renderView();
  }
  function tabbarHTML() {
    var tabs = [["passport", "🎾", "Passport"], ["rankings", "🏆", "Rankings"], ["main", "📅", "Main"], ["profil", "👤", "Profil"]];
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
  function refreshTabbar() {
    var old = d.querySelector(".tabbar"); if (old) old.outerHTML = tabbarHTML(); bindTabs();
  }
  function viewEl() { return d.getElementById("view"); }

  function renderView() {
    if (S.view === "passport") return renderPassport();
    if (S.view === "rankings") return renderRankings();
    if (S.view === "main") return renderMain();
    if (S.view === "profil") return renderProfil();
    if (S.view === "ranked-info") return renderRankedInfo();
  }

  /* ---------- ensure account/me + cutoffs cached ---------- */
  async function ensureMe() {
    if (!S.me) S.me = await API.accountMe(S.token);
    S.myName = (S.me && S.me.player && S.me.player.name) || "";
    return S.me;
  }
  async function ensureCut() {
    if (!S.cut) { try { S.cut = await API.getTierBoundaries(); } catch (e) { S.cut = { t1: 2000, t2: 1500 }; } }
    return S.cut;
  }

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

      var heroInner = unrated
        ? '<p class="lbl">ELO Rating</p><p class="num" style="font-size:34px">Unrated</p><p style="margin:6px 0 0;font-size:12.5px;opacity:.92">Rating muncul setelah match PlayRank pertama</p>'
        : '<p class="lbl">ELO Rating</p><p class="num">' + elo + '</p>' +
          '<span class="tier">🏆 ' + esc(API.tierName(elo, cut)) + '</span>' +
          (last && last.delta ? '<span class="delta">' + (last.delta >= 0 ? "▲ +" : "▼ ") + Math.abs(last.delta) + '</span>' : "");

      var calib = (!unrated && matches < 15)
        ? '<div class="calib"><b>Kalibrasi:</b> ' + Math.max(0, 15 - matches) + ' match lagi supaya tier resmimu ditentukan. ELO bergerak lebih cepat selama masa ini.</div>'
        : "";

      viewEl().innerHTML =
        '<div class="screen">' +
          '<div class="p-top"><div><div class="p-hi">Passport</div><div class="p-name">' + esc(display) + '</div>' +
            (region || club ? '<div class="p-meta">' + esc([region, club].filter(Boolean).join(" · ")) + '</div>' : "") + '</div>' +
            '<div class="ava">' + (photo ? '<img src="' + esc(photo) + '" alt=""/>' : esc(initials(display))) + '</div></div>' +
          '<div class="hero" id="tierChip" role="button">' + heroInner + '</div>' +
          calib +
          '<div class="statrow"><div class="stat"><b>' + (wins != null ? wins : "–") + '</b><span>Menang</span></div>' +
            '<div class="stat"><b>' + (losses != null ? losses : "–") + '</b><span>Kalah</span></div>' +
            '<div class="stat"><b>' + (matches != null ? matches : "–") + '</b><span>Match</span></div></div>' +
          '<div class="actrow"><button class="btn" id="share">Share Player Card</button>' +
            '<button class="btn ghost soon" id="challenge" style="flex:0 0 auto;width:auto;padding:15px 16px">Challenge</button></div>' +
          (recent.length ? '<div class="sec">Riwayat ELO</div>' + recent.map(function (h) {
            var up = (h.delta || 0) >= 0;
            return '<div class="hitem"><span class="d">' + esc(fmtDate(h.timestamp)) + '</span><span class="e">' + h.elo + '</span>' +
              '<span class="' + (up ? "up" : "dn") + '">' + (up ? "▲ +" : "▼ ") + Math.abs(h.delta || 0) + '</span></div>';
          }).join("") : "") +
        '</div>';

      d.getElementById("tierChip").onclick = function () { S.prev = "passport"; S.view = "ranked-info"; refreshTabbar(); renderView(); w.scrollTo(0, 0); };
      d.getElementById("challenge").onclick = function () { toast("Challenge pemain — segera hadir 🔜"); };
      d.getElementById("share").onclick = function () { sharePlayerCard(display, elo, unrated ? null : API.tierName(elo, cut), name); };
    } catch (e) {
      viewEl().innerHTML = errorBox("Gagal memuat passport.", renderPassport);
    }
  }
  function passportNoPlayer(me) {
    viewEl().innerHTML = '<div class="screen"><div class="emptybig"><div class="em">🔗</div>' +
      '<h1 class="page" style="margin-top:14px">Belum tertaut</h1>' +
      '<p style="color:var(--mu);font-size:14px;line-height:1.6">Akun ini (' + esc(me.email || "") + ') belum tertaut ke profil pemain. Klaim profilmu di web, lalu tunggu persetujuan admin.</p>' +
      '<a class="btn" style="display:block;margin-top:18px;text-decoration:none;text-align:center" href="https://trekkr.online/join" target="_blank" rel="noopener">Klaim di web</a></div></div>';
  }

  function sharePlayerCard(name, elo, tier, canonName) {
    var url = "https://trekkr.online/player/" + slug(canonName);
    var text = elo != null ? (name + " — " + elo + " ELO · " + tier + " di Trekkr") : (name + " di Trekkr");
    if (navigator.share) {
      navigator.share({ title: "Trekkr Passport", text: text, url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text + " " + url).then(function () { toast("Link passport disalin ✓"); });
    } else { toast(url); }
  }

  /* ---------- RANKINGS ---------- */
  async function renderRankings() {
    viewEl().innerHTML = '<div class="screen"><div class="center" style="min-height:40vh"><div class="spinner"></div></div></div>';
    try {
      var r = await Promise.all([API.getLeaderboard({ limit: 200 }), ensureCut(), ensureMe()]);
      var list = (r[0] && r[0].leaderboard) || [], cut = r[1];
      list = list.filter(function (p) { return (Number(p.totalMatches) || 0) >= 15; })
        .map(function (p) { return { name: p.name, elo: Number(p.elo) || 0, region: p.region, clubs: p.clubs }; })
        .sort(function (a, b) { return b.elo - a.elo; });

      function tierOf(elo) { return elo >= ((cut && cut.t1) || 2000) ? "T1" : elo >= ((cut && cut.t2) || 1500) ? "T2" : "T3"; }
      var f = S.rankFilter;
      var shown = list.filter(function (p) { return f === "all" || tierOf(p.elo) === f; });

      var chips = [["all", "Semua"], ["T1", "T1"], ["T2", "T2"], ["T3", "T3"]].map(function (c) {
        return '<button class="chip' + (f === c[0] ? " on" : "") + '" data-f="' + c[0] + '">' + c[1] + '</button>';
      }).join("");

      var rows = shown.map(function (p, i) {
        var mine = S.myName && norm(p.name) === norm(S.myName);
        // rank = index within the FULL sorted list (not filtered)
        var rank = list.indexOf(list.find(function (x) { return norm(x.name) === norm(p.name); })) + 1;
        return '<div class="rrow' + (rank <= 3 ? " top" : "") + (mine ? " me" : "") + '">' +
          '<span class="rk">' + rank + '</span>' +
          '<span class="who"><span class="nm">' + esc(p.name) + (mine ? " · kamu" : "") + '</span>' +
          '<span class="mt">' + esc(API.tierName(p.elo, cut)) + (p.region ? " · " + esc(p.region) : "") + '</span></span>' +
          '<span class="el">' + p.elo + '</span></div>';
      }).join("");

      viewEl().innerHTML = '<div class="screen">' +
        '<div class="rtitle">Rankings</div><div class="rsub">Pemain terkalibrasi (≥15 match) · nasional</div>' +
        '<div class="chips">' + chips + '</div>' +
        (rows || '<div class="emptybig"><div class="em">🏆</div><p>Belum ada pemain di filter ini.</p></div>') +
        '</div>';

      Array.prototype.forEach.call(d.querySelectorAll(".chip"), function (c) {
        c.onclick = function () { S.rankFilter = c.getAttribute("data-f"); renderRankings(); };
      });
    } catch (e) {
      viewEl().innerHTML = errorBox("Gagal memuat rankings.", renderRankings);
    }
  }

  /* ---------- MAIN (placeholder MVP) ---------- */
  function renderMain() {
    viewEl().innerHTML = '<div class="screen">' +
      '<h1 class="page">Main</h1>' +
      '<div class="emptybig"><div class="em">📅</div>' +
      '<p style="max-width:32ch;margin:12px auto 0">Jadwal PlayRank &amp; event akan tampil di sini. Tombol <b>Daftar</b> membuka link yang di-set admin per event.</p>' +
      '<p style="color:var(--faint);font-size:12.5px;margin-top:10px">Segera — sedang disiapkan.</p></div></div>';
  }

  /* ---------- PROFIL ---------- */
  async function renderProfil() {
    viewEl().innerHTML = '<div class="screen"><div class="center" style="min-height:30vh"><div class="spinner"></div></div></div>';
    try {
      var me = await ensureMe();
      var name = (me.player && (me.player.displayName || me.player.name)) || "—";
      viewEl().innerHTML = '<div class="screen">' +
        '<h1 class="page">Profil</h1>' +
        '<div class="plain"><h3>' + esc(name) + '</h3><p>' + esc(me.email || "") + '</p></div>' +
        '<button class="plain" id="howto" style="width:100%;text-align:left;border:1px solid var(--line)"><h3>🧭 Cara dapat ranking</h3><p>ELO, tier, &amp; cara naik peringkat.</p></button>' +
        '<a class="plain" style="display:block;text-decoration:none" href="https://trekkr.online/player/' + slug((me.player && me.player.name) || "") + '" target="_blank" rel="noopener"><h3>✏️ Edit profil (web)</h3><p>Ubah nama tampilan, foto, IG, region.</p></a>' +
        '<a class="plain" style="display:block;text-decoration:none" href="https://trekkr.online/reset" target="_blank" rel="noopener"><h3>🔑 Ganti password</h3><p>Lewat tautan reset password.</p></a>' +
        '<button class="btn ghost" id="logout" style="margin-top:16px">Keluar</button>' +
        '</div>';
      d.getElementById("logout").onclick = function () { sb.auth.signOut(); };
      d.getElementById("howto").onclick = function () { S.prev = "profil"; S.view = "ranked-info"; refreshTabbar(); renderView(); w.scrollTo(0, 0); };
    } catch (e) {
      viewEl().innerHTML = errorBox("Gagal memuat profil.", renderProfil);
    }
  }

  /* ---------- RANKED INFO (education) ---------- */
  async function renderRankedInfo() {
    var cut = await ensureCut();
    var t1 = (cut && cut.t1) || 2000, t2 = (cut && cut.t2) || 1500;
    viewEl().innerHTML = '<div class="screen">' +
      '<button class="link" id="back" style="padding-left:0">‹ Kembali</button>' +
      '<h1 class="page" style="margin-top:4px">Cara Dapat Ranking</h1>' +
      '<div class="plain"><h3>3 langkah</h3><p>1 · Daftar / klaim profil.<br>2 · Main di sesi PlayRank / venue mitra — host mencatat hasil, ELO dihitung otomatis.<br>3 · Setelah ≥15 match (kalibrasi selesai), rating &amp; Series Tier resmi muncul.</p></div>' +
      '<div class="plain"><h3>Apa itu ELO?</h3><p>Angka kekuatan yang naik/turun tiap match berdasar kekuatan lawan &amp; selisih skor. Menang lawan lebih kuat atau menang telak → naik lebih banyak. Selama kalibrasi (15 match pertama) bergerak lebih cepat.</p></div>' +
      '<div class="plain"><h3>Tangga skill — ELO Tier</h3>' +
        '<table class="ttable"><tr><th>Tier</th><th class="r">ELO</th></tr>' +
        row("Beginner", "< 900") + row("Upper Beginner", "900–1199") + row("Lower Bronze", "1200–1499") +
        row("Bronze", "1500–1799") + row("Upper Bronze", "1800–2099") + row("Silver", "2100–2499") +
        row("Gold", "2500–2999") + row("Platinum", "≥ 3000") + '</table></div>' +
      '<div class="plain"><h3>Divisi kompetitif — T1 / T2 / T3</h3>' +
        '<p>Dipakai untuk Trekkr Series &amp; Liga. Ditentukan dari posisimu di antara pemain aktif (persentil), jadi cutoff bergeser &amp; dihitung ulang berkala. <b>T1 bersifat Open.</b></p>' +
        '<table class="ttable" style="margin-top:10px"><tr><th>Tier</th><th>Cutoff kini</th><th>≈ level</th></tr>' +
        '<tr><td style="font-weight:800;color:var(--or)">T1 · Open</td><td>ELO ≥ ' + t1 + '</td><td>Bronze+</td></tr>' +
        '<tr><td style="font-weight:800">T2</td><td>' + t2 + '–' + (t1 - 1) + '</td><td>Lower Bronze</td></tr>' +
        '<tr><td style="font-weight:800">T3</td><td>&lt; ' + t2 + '</td><td>Beginner–L.Bronze</td></tr>' +
        '</table>' +
        '<p style="margin-top:10px;font-size:12px;color:var(--faint)">Padanan ke Bronze dll cuma biar gampang dimengerti — bukan patokan utama; bisa bergeser seiring populasi.</p></div>' +
      '</div>';
    d.getElementById("back").onclick = function () { S.view = S.prev || "passport"; refreshTabbar(); renderView(); w.scrollTo(0, 0); };
    function row(a, b2) { return '<tr><td>' + a + '</td><td class="r">' + b2 + '</td></tr>'; }
  }

  /* ---------- shared bits ---------- */
  function errorBox(msg, retry) {
    setTimeout(function () { var b = d.getElementById("retry"); if (b) b.onclick = retry; }, 0);
    return '<div class="screen"><div class="emptybig"><div class="em">⚠️</div><p>' + esc(msg) + '</p>' +
      '<button class="btn ghost" id="retry" style="max-width:200px;margin:14px auto 0">Coba lagi</button></div></div>';
  }

  /* ---------- iOS install hint ---------- */
  function maybeIosHint() {
    if (!isIosSafari()) return;
    try { if (localStorage.getItem("trekkr_ioshint") === "off") return; } catch (e) {}
    var el = d.createElement("div");
    el.className = "ioshint";
    el.innerHTML = '<button class="x" aria-label="Tutup">×</button>' +
      '<h5>Pasang Trekkr di iPhone</h5>' +
      '<p>Tap <b>Share</b> ⬆️ di Safari → <b>Add to Home Screen</b>. Gratis, tanpa App Store.</p>';
    d.body.appendChild(el);
    el.querySelector(".x").onclick = function () { el.remove(); try { localStorage.setItem("trekkr_ioshint", "off"); } catch (e) {} };
  }

  boot();
})(window, document);
