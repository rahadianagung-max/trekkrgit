/* Trekkr — shared site nav. Drop-in: add <div id="tk-nav"></div> near the top
   of <body> and <script src="/trekkr-nav.js" defer></script>. Renders the
   main menu (Players / PlayRank / League & Tournament) with a Get-the-App
   button and the player account button (Masuk → /login, or the signed-in
   player's chip with Passport / Keluar), plus a mobile sheet. Venue-admin login
   lives in the PlayRank menu and the mobile sheet. Self-styled. Also loaded on
   the venue subdomain (venue.trekkr.online), where site links become absolute. */
(function (w, d) {
  "use strict";
  var ADMIN = "https://admin.trekkr.online";
  var VENUE = "https://venue.trekkr.online";
  var host = location.hostname;
  var onVenue = /^venue\./.test(host);
  // Site-relative links resolve against trekkr.online when rendered elsewhere
  // (venue subdomain, previews of other projects).
  var mainSite = host === "trekkr.online" || host === "localhost" || host === "127.0.0.1" || (/\.vercel\.app$/.test(host) && /^trekkrgit/.test(host));
  var SITE = mainSite ? "" : "https://trekkr.online";

  // Main menu (label → dropdown items). `cta:true` styles the item as a button.
  // `venueGroup` says which group is active on the venue subdomain.
  var GROUPS = [
    { label: "Players", items: [
      ["Rankings", "/rankings"],
      ["Player passport", "/passport"],
      ["ELO & tiers explained", "/how-trekkr-works"],
      ["How we track your play", "/how-it-works"],
      ["What is Trekkr", "/about"],
      ["Get the Player App", "/app", true],
    ] },
    { label: "PlayRank", items: [
      ["What is PlayRank", "/playrank"],
      ["Venues & Community", "/venues"],
      ["Join / Get listed", "/get-listed"],
      ["Login admin venue ↗", ADMIN],
    ], venueGroup: "pr" },
    { label: "League & Tournament", items: [
      ["Tourney & League overview", "/tournament"],
      ["Tournaments", VENUE + "/?tab=tn"],
      ["Leagues", VENUE + "/?tab=lg"],
      ["Liga Trekkr", "/liga-trekkr"],
      ["Season calendar", "/season"],
      ["Trekkr Series", "/series"],
    ], venueGroup: "tl" },
  ];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var path = location.pathname.replace(/\/+$/, "") || "/";
  function isActive(href) {
    if (!href || href.charAt(0) !== "/") return false;
    var h = href.replace(/\/+$/, "") || "/";
    return h === path;
  }
  function groupActive(g) {
    if (onVenue) {
      // venue.trekkr.online: tournament/league pages (or their directory tabs)
      // belong to League & Tournament; everything else there is PlayRank venues.
      var tourney = /^\/(tournament|league)\b/.test(path) || /[?&]tab=(tn|lg)/.test(location.search);
      return g.venueGroup === "tl" ? tourney : g.venueGroup === "pr" ? !tourney : false;
    }
    return g.items.some(function (it) { return isActive(it[1]); });
  }
  function href(h) { return h.charAt(0) === "/" ? SITE + h : h; }
  // Only third-party / admin links open a new tab; Trekkr's own sites stay in-tab.
  function attrs(h) { return (h.charAt(0) === "/" || h.indexOf(VENUE) === 0) ? "" : ' target="_blank" rel="noopener"'; }

  function menuItems(items) {
    return items.map(function (it) {
      return '<a class="tk-mi' + (it[2] ? " cta" : "") + (!onVenue && isActive(it[1]) ? " on" : "") + '" href="' + esc(href(it[1])) + '"' + attrs(it[1]) + ">" + esc(it[0]) + "</a>";
    }).join("");
  }

  function desktopNav() {
    var drops = GROUPS.map(function (g) {
      return '<div class="tk-drop' + (groupActive(g) ? " on" : "") + '">' +
        '<button class="tk-dt" aria-haspopup="true" aria-expanded="false">' + esc(g.label) +
        ' <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<div class="tk-menu">' + menuItems(g.items) + "</div></div>";
    }).join("");
    return '<nav class="tk-nav" aria-label="Primary">' + drops + "</nav>";
  }

  function mobileNav() {
    var groups = GROUPS.map(function (g) {
      return '<div class="tk-mgroup"><div class="tk-mlabel">' + esc(g.label) + "</div>" + menuItems(g.items) + "</div>";
    }).join("");
    return '<div class="tk-msheet" id="tkMsheet">' + groups + '<div class="tk-mgroup">' +
      '<a class="tk-mi" href="' + ADMIN + '" target="_blank" rel="noopener">Login admin venue ↗</a></div></div>';
  }

  function css() {
    return '<style id="tk-nav-css">' +
      '.tk-header{position:sticky;top:0;z-index:60;background:#fff;border-bottom:3px solid #090D14}' +
      '.tk-in{display:flex;align-items:center;gap:18px;min-height:64px;width:min(1180px,calc(100% - 40px));margin:0 auto}' +
      '.tk-wrap{width:min(1180px,calc(100% - 40px));margin:0 auto}' +
      '.tk-brand{display:inline-flex;align-items:center;font:900 italic 25px/1 "Plus Jakarta Sans",system-ui,sans-serif;letter-spacing:-.04em;text-transform:uppercase;color:#090D14;text-decoration:none;flex:0 0 auto}' +
      '.tk-brand i{font-style:normal;background:#FF5900;color:#fff;padding:1px 7px;margin-left:3px}' +
      '.tk-logo{height:28px;width:auto;display:block}@media(max-width:560px){.tk-logo{height:22px}}' +
      '.tk-nav{display:flex;align-items:center;gap:2px;flex:1}' +
      '.tk-drop{position:relative}' +
      '.tk-dt,.tk-solo{display:inline-flex;align-items:center;gap:5px;font:800 11.5px "JetBrains Mono",ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;color:#090D14;background:none;border:none;padding:10px 11px;cursor:pointer;text-decoration:none}' +
      '.tk-dt:hover,.tk-solo:hover{background:#F4F6F9}' +
      '.tk-drop.on .tk-dt,.tk-solo.on{box-shadow:inset 0 -3px 0 #FF5900}' +
      '.tk-menu{position:absolute;top:calc(100% + 4px);left:0;min-width:240px;background:#fff;border:2px solid #090D14;box-shadow:5px 5px 0 #090D14;padding:4px;display:none;flex-direction:column;gap:0}' +
      '.tk-drop:hover .tk-menu,.tk-drop:focus-within .tk-menu,.tk-drop.open .tk-menu{display:flex}' +
      '.tk-mi{display:block;padding:11px 12px;font:800 11.5px "JetBrains Mono",ui-monospace,monospace;letter-spacing:.05em;text-transform:uppercase;color:#090D14;text-decoration:none;border-bottom:1px solid #E2E8F0}' +
      '.tk-mi:last-child{border-bottom:0}' +
      '.tk-mi:hover{background:#F4F6F9}' +
      '.tk-mi.on{color:#FF5900}' +
      '.tk-mi.cta{background:#D2F802;border:2px solid #090D14;margin-top:4px}.tk-mi.cta:hover{background:#c4e800}' +
      '.tk-act{display:flex;align-items:center;gap:9px;flex:0 0 auto}' +
      '.tk-getapp,.tk-login{font:800 11px "JetBrains Mono",ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;padding:9px 12px;border:2px solid #090D14;box-shadow:3px 3px 0 #090D14;text-decoration:none;white-space:nowrap;color:#090D14}' +
      '.tk-getapp{background:#D2F802}.tk-login{background:#fff}' +
      '.tk-getapp:active,.tk-login:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #090D14}' +
      '.tk-burger{display:none;background:#D2F802;border:2px solid #090D14;width:40px;height:40px;align-items:center;justify-content:center;color:#090D14;font-size:19px;font-weight:900;cursor:pointer}' +
      '.tk-msheet{display:none;flex-direction:column;gap:0;padding:6px 0 16px;border-top:2px solid #090D14}' +
      '.tk-msheet.open{display:flex}' +
      '.tk-mgroup{display:flex;flex-direction:column;padding:6px 0;border-bottom:2px solid #090D14}.tk-mgroup:last-child{border-bottom:none}' +
      '.tk-mlabel{font:800 10px "JetBrains Mono",ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#FF5900;padding:8px 12px 4px}' +
      '.tk-acct{position:relative}' +
      '.tk-me{display:inline-flex;align-items:center;gap:8px;max-width:210px;padding:5px 10px 5px 5px;background:#fff;border:2px solid #090D14;box-shadow:3px 3px 0 #FF5900;font:800 11px "JetBrains Mono",ui-monospace,monospace;letter-spacing:.04em;text-transform:uppercase;color:#090D14;cursor:pointer}' +
      '.tk-av{position:relative;width:26px;height:26px;flex:none;display:flex;align-items:center;justify-content:center;background:#FF5900;color:#fff;font:800 12px "JetBrains Mono",monospace;overflow:hidden}' +
      '.tk-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}' +
      '.tk-mename{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.tk-medot{width:8px;height:8px;background:#22A052;flex:none}' +
      '.tk-acct .tk-menu{left:auto;right:0;min-width:230px}' +
      '.tk-acct.open .tk-menu{display:flex}' +
      '.tk-mhead{padding:10px 12px;border-bottom:2px solid #090D14;background:#F4F6F9}' +
      '.tk-mhead b{display:block;font:800 13px "Plus Jakarta Sans",system-ui,sans-serif;color:#090D14}' +
      '.tk-mhead small{display:block;margin-top:2px;font:600 11px "Plus Jakarta Sans",system-ui,sans-serif;color:#64748B;overflow:hidden;text-overflow:ellipsis}' +
      '.tk-mi.out{color:#B91C1C;text-align:left;background:none;border:0;cursor:pointer;width:100%}' +
      '@media(max-width:900px){.tk-nav{display:none}.tk-burger{display:flex}}' +
      '@media(max-width:560px){.tk-mename{display:none}.tk-me{padding:5px}}' +
      '@media(max-width:560px){.tk-getapp{display:none}}' +
      "</style>";
  }

  function mount() {
    var el = d.getElementById("tk-nav");
    if (!el) return;
    el.innerHTML = css() +
      '<header class="tk-header"><div class="tk-in">' +
        '<a class="tk-brand" href="' + (SITE || "/") + '" aria-label="Trekkr home"><img src="' + SITE + '/trekkr-logo.png" alt="Trekkr" class="tk-logo"></a>' +
        desktopNav() +
        '<div class="tk-act">' +
          '<a class="tk-getapp" href="' + SITE + '/app">Get the App</a>' +
          '<div class="tk-acct" id="tkAcct"><a class="tk-login" href="' + SITE + '/login">Masuk</a></div>' +
          '<button class="tk-burger" id="tkBurger" aria-label="Menu" aria-expanded="false">&#9776;</button>' +
        "</div>" +
      '</div><div class="tk-wrap">' + mobileNav() + "</div></header>";

    var burger = d.getElementById("tkBurger"), sheet = d.getElementById("tkMsheet");
    if (burger && sheet) burger.onclick = function () { var o = sheet.classList.toggle("open"); burger.setAttribute("aria-expanded", o ? "true" : "false"); };
    // Touch: tap a dropdown toggle to open (desktop uses hover/focus).
    Array.prototype.forEach.call(d.querySelectorAll(".tk-drop .tk-dt"), function (b) {
      b.onclick = function (e) {
        var drop = b.parentNode, wasOpen = drop.classList.contains("open");
        Array.prototype.forEach.call(d.querySelectorAll(".tk-drop.open"), function (x) { x.classList.remove("open"); });
        if (!wasOpen) { drop.classList.add("open"); e.stopPropagation(); }
      };
    });
    d.addEventListener("click", function () { Array.prototype.forEach.call(d.querySelectorAll(".tk-drop.open,.tk-acct.open"), function (x) { x.classList.remove("open"); }); });
    account();
  }

  // ---- Player account (top-right) ----
  // The signed-in state lives in localStorage on trekkr.online (trekkr-auth.js).
  // Subdomains can't read it, so there we always show "Masuk".
  var TK = "trekkr_player_token", ME = "trekkr_player_me", KEYS = ["trekkr_player_token", "trekkr_player_refresh", "trekkr_player_exp", "trekkr_player_me"];
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function slug(n) { return String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function renderAcct(me) {
    var box = d.getElementById("tkAcct"); if (!box) return;
    box.className = "tk-acct";
    if (!me) { box.innerHTML = '<a class="tk-login" href="' + SITE + '/login">Masuk</a>'; return; }
    var p = me.player || null, name = p ? (p.display_name || p.name) : "Akun saya";
    var ini = String(name || "?").trim().split(/\s+/).map(function (x) { return x.charAt(0); }).join("").slice(0, 2).toUpperCase() || "?";
    var av = p && p.photo_url ? '<img src="' + esc(p.photo_url) + '" alt="" onerror="this.remove()">' : "";
    var links = p
      ? '<a class="tk-mi" href="' + SITE + '/player/' + esc(slug(p.name)) + '">Passport saya</a>'
      : '<a class="tk-mi" href="' + SITE + '/join">Klaim / daftar profil</a>';
    box.innerHTML = '<button class="tk-me" id="tkMe" aria-haspopup="true" aria-expanded="false" title="' + esc(name) + ' — sudah masuk">' +
        '<span class="tk-av">' + esc(ini) + av + '</span><span class="tk-mename">' + esc(name) + '</span><span class="tk-medot"></span></button>' +
      '<div class="tk-menu"><div class="tk-mhead"><b>' + esc(p ? p.name : "Belum ada profil") + '</b><small>' + esc(me.email || "Sudah masuk") + '</small></div>' +
        links + '<button class="tk-mi out" id="tkOut">Keluar</button></div>';
    var b = d.getElementById("tkMe");
    b.onclick = function (e) { e.stopPropagation(); var o = box.classList.toggle("open"); b.setAttribute("aria-expanded", o ? "true" : "false"); };
    d.getElementById("tkOut").onclick = logout;
  }
  function logout() {
    try { if (w.TrekkrAuth) w.TrekkrAuth.clear(); } catch (e) {}
    KEYS.forEach(function (k) { ls(k, null); });
    // The Player App (/app) keeps its own Supabase session — sign that out too.
    try { Object.keys(localStorage).forEach(function (k) { if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); }); } catch (e) {}
    try { sessionStorage.removeItem("trekkr_me_at"); } catch (e) {}
    location.href = (SITE || "") + "/";
  }
  function loadAuth() {
    if (w.TrekkrAuth) return Promise.resolve(w.TrekkrAuth);
    return new Promise(function (res) {
      var s = d.createElement("script"); s.src = "/trekkr-auth.js";
      s.onload = function () { res(w.TrekkrAuth || null); }; s.onerror = function () { res(null); };
      d.head.appendChild(s);
    });
  }
  function account() {
    if (!mainSite || !ls(TK)) return;
    var cached = null; try { cached = JSON.parse(ls(ME) || "null"); } catch (e) {}
    renderAcct(cached || { player: null, email: "" });
    var at = 0; try { at = Number(sessionStorage.getItem("trekkr_me_at")) || 0; } catch (e) {}
    if (cached && Date.now() - at < 5 * 60 * 1000) return; // re-check at most every 5 min
    loadAuth().then(function (A) { return A ? A.token() : ls(TK); }).then(function (t) {
      if (!t) { KEYS.forEach(function (k) { ls(k, null); }); renderAcct(null); return; }
      return fetch("/api/account/me?token=" + encodeURIComponent(t)).then(function (r) {
        if (r.status === 401) { KEYS.forEach(function (k) { ls(k, null); }); renderAcct(null); return; }
        if (!r.ok) return;
        return r.json().then(function (me) {
          var keep = { email: me.email || "", player: me.player ? { name: me.player.name, display_name: me.player.display_name, photo_url: me.player.photo_url } : null };
          ls(ME, JSON.stringify(keep)); try { sessionStorage.setItem("trekkr_me_at", String(Date.now())); } catch (e) {}
          renderAcct(keep);
        });
      });
    }).catch(function () {});
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", mount); else mount();
})(window, document);
