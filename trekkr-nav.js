/* Trekkr — shared site nav. Drop-in: add <div id="tk-nav"></div> near the top
   of <body> and <script src="/trekkr-nav.js" defer></script>. Renders the
   main menu (Players / PlayRank / League & Tournament) with a Get-the-App
   button and a venue Login, plus a mobile sheet. Self-styled. Also loaded on the
   venue subdomain (venue.trekkr.online), where site links become absolute. */
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
      ["Venue login (host here)", ADMIN],
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
      '<a class="tk-mi" href="' + ADMIN + '" target="_blank" rel="noopener">Venue / admin login</a></div></div>';
  }

  function css() {
    return '<style id="tk-nav-css">' +
      '.tk-header{position:sticky;top:0;z-index:60;background:#fff;border-bottom:3px solid #090D14}' +
      '.tk-in{display:flex;align-items:center;gap:18px;min-height:64px;width:min(1180px,calc(100% - 40px));margin:0 auto}' +
      '.tk-wrap{width:min(1180px,calc(100% - 40px));margin:0 auto}' +
      '.tk-brand{display:inline-flex;align-items:center;font:900 italic 25px/1 "Plus Jakarta Sans",system-ui,sans-serif;letter-spacing:-.04em;text-transform:uppercase;color:#090D14;text-decoration:none;flex:0 0 auto}' +
      '.tk-brand i{font-style:normal;background:#FF5900;color:#fff;padding:1px 7px;margin-left:3px}' +
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
      '@media(max-width:900px){.tk-nav,.tk-login{display:none}.tk-burger{display:flex}}' +
      '@media(max-width:560px){.tk-getapp{display:none}}' +
      "</style>";
  }

  function mount() {
    var el = d.getElementById("tk-nav");
    if (!el) return;
    el.innerHTML = css() +
      '<header class="tk-header"><div class="tk-in">' +
        '<a class="tk-brand" href="' + (SITE || "/") + '" aria-label="Trekkr home">Trekkr<i>//</i></a>' +
        desktopNav() +
        '<div class="tk-act">' +
          '<a class="tk-getapp" href="' + SITE + '/app">Get the App</a>' +
          '<a class="tk-login" href="' + ADMIN + '" target="_blank" rel="noopener">Login</a>' +
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
    d.addEventListener("click", function () { Array.prototype.forEach.call(d.querySelectorAll(".tk-drop.open"), function (x) { x.classList.remove("open"); }); });
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", mount); else mount();
})(window, document);
