/* Trekkr — shared site nav. Drop-in: add <div id="tk-nav"></div> near the top
   of <body> and <script src="/trekkr-nav.js" defer></script>. Renders the
   audience-based header (Players / Venues & Community / Liga Trekkr + Rankings)
   with a Get-the-App button and a venue Login, plus a mobile sheet. Self-styled. */
(function (w, d) {
  "use strict";
  var ADMIN = "https://admin.trekkr.online";

  // Audience groups (label → dropdown items). `cta:true` styles the item as a button.
  var GROUPS = [
    { label: "Players", items: [
      ["What is Trekkr", "/about"],
      ["How we track your play", "/how-it-works"],
      ["ELO & tiers explained", "/how-trekkr-works"],
      ["Get the Player App", "/app", true],
    ] },
    { label: "Venues & Community", items: [
      ["Join / Get listed", "/get-listed"],
      ["Venue & community directory", "/venues"],
      ["Venue login (host here)", ADMIN],
    ] },
    { label: "Liga Trekkr", items: [
      ["How the league works", "/liga-trekkr"],
      ["Season calendar", "/season"],
      ["Trekkr Series", "/series"],
    ] },
  ];
  var SOLO = [["Rankings", "/rankings"]];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var path = location.pathname.replace(/\/+$/, "") || "/";
  function isActive(href) {
    if (!href || href.charAt(0) !== "/") return false;
    var h = href.replace(/\/+$/, "") || "/";
    return h === path;
  }
  function groupActive(g) { return g.items.some(function (it) { return isActive(it[1]); }); }
  function attrs(href) { return href.charAt(0) === "/" ? "" : ' target="_blank" rel="noopener"'; }

  function menuItems(items) {
    return items.map(function (it) {
      return '<a class="tk-mi' + (it[2] ? " cta" : "") + (isActive(it[1]) ? " on" : "") + '" href="' + esc(it[1]) + '"' + attrs(it[1]) + ">" + esc(it[0]) + "</a>";
    }).join("");
  }

  function desktopNav() {
    var drops = GROUPS.map(function (g) {
      return '<div class="tk-drop' + (groupActive(g) ? " on" : "") + '">' +
        '<button class="tk-dt" aria-haspopup="true" aria-expanded="false">' + esc(g.label) +
        ' <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<div class="tk-menu">' + menuItems(g.items) + "</div></div>";
    }).join("");
    var solo = SOLO.map(function (s) { return '<a class="tk-solo' + (isActive(s[1]) ? " on" : "") + '" href="' + esc(s[1]) + '">' + esc(s[0]) + "</a>"; }).join("");
    return '<nav class="tk-nav" aria-label="Primary">' + drops + solo + "</nav>";
  }

  function mobileNav() {
    var groups = GROUPS.map(function (g) {
      return '<div class="tk-mgroup"><div class="tk-mlabel">' + esc(g.label) + "</div>" + menuItems(g.items) + "</div>";
    }).join("");
    var solo = SOLO.map(function (s) { return '<a class="tk-mi' + (isActive(s[1]) ? " on" : "") + '" href="' + esc(s[1]) + '">' + esc(s[0]) + "</a>"; }).join("");
    return '<div class="tk-msheet" id="tkMsheet">' + groups + '<div class="tk-mgroup">' + solo +
      '<a class="tk-mi" href="' + ADMIN + '" target="_blank" rel="noopener">Venue / admin login</a></div></div>';
  }

  function css() {
    return '<style id="tk-nav-css">' +
      '.tk-header{position:sticky;top:0;z-index:60;background:rgba(255,255,255,.85);backdrop-filter:blur(14px);border-bottom:1px solid var(--border-soft,#EDEDF0)}' +
      '.tk-in{display:flex;align-items:center;gap:16px;min-height:66px;width:min(1180px,calc(100% - 40px));margin:0 auto}' +
      '.tk-wrap{width:min(1180px,calc(100% - 40px));margin:0 auto}' +
      '.tk-brand{display:inline-block;font-family:var(--display),sans-serif;font-style:italic;font-weight:800;font-size:25px;text-transform:uppercase;background:var(--grad,linear-gradient(90deg,#FF3830,#FFB000));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;padding:.04em .3em .04em .02em;text-decoration:none;flex:0 0 auto}' +
      '.tk-nav{display:flex;align-items:center;gap:2px;flex:1}' +
      '.tk-drop{position:relative}' +
      '.tk-dt{display:inline-flex;align-items:center;gap:5px;font-family:inherit;font-size:13px;font-weight:600;color:var(--muted,#52525B);background:none;border:none;padding:8px 12px;border-radius:999px;cursor:pointer}' +
      '.tk-dt:hover{color:var(--text,#0D0D0D);background:var(--surface-2,#F5F5F7)}' +
      '.tk-drop.on .tk-dt{color:var(--orange,#FF6A00)}' +
      '.tk-menu{position:absolute;top:calc(100% + 6px);left:0;min-width:230px;background:#fff;border:1px solid var(--border,#E4E4E7);border-radius:14px;box-shadow:0 18px 40px -14px rgba(0,0,0,.22);padding:7px;display:none;flex-direction:column;gap:2px}' +
      '.tk-drop:hover .tk-menu,.tk-drop:focus-within .tk-menu,.tk-drop.open .tk-menu{display:flex}' +
      '.tk-mi{display:block;padding:10px 12px;border-radius:9px;font-size:13.5px;font-weight:600;color:var(--muted,#52525B);text-decoration:none}' +
      '.tk-mi:hover{background:var(--surface-2,#F5F5F7);color:var(--text,#0D0D0D)}' +
      '.tk-mi.on{color:var(--orange,#FF6A00)}' +
      '.tk-mi.cta{background:var(--orange,#FF6A00);color:#fff;margin-top:3px;font-weight:800}.tk-mi.cta:hover{background:#e85f00;color:#fff}' +
      '.tk-solo{font-size:13px;font-weight:600;color:var(--muted,#52525B);padding:8px 12px;border-radius:999px;text-decoration:none}' +
      '.tk-solo:hover{color:var(--text,#0D0D0D);background:var(--surface-2,#F5F5F7)}.tk-solo.on{color:var(--orange,#FF6A00)}' +
      '.tk-act{display:flex;align-items:center;gap:9px;flex:0 0 auto}' +
      '.tk-getapp{background:var(--grad,linear-gradient(90deg,#FF3830,#FFB000));color:#fff;font-weight:800;font-size:13px;padding:9px 16px;border-radius:999px;text-decoration:none;white-space:nowrap;box-shadow:0 10px 22px -12px rgba(255,80,0,.6)}' +
      '.tk-login{font-size:13px;font-weight:700;color:var(--text,#0D0D0D);border:1px solid var(--border,#E4E4E7);padding:8px 15px;border-radius:999px;text-decoration:none;white-space:nowrap}' +
      '.tk-login:hover{background:var(--surface-2,#F5F5F7)}' +
      '.tk-burger{display:none;background:none;border:1px solid var(--border,#E4E4E7);border-radius:10px;width:40px;height:40px;align-items:center;justify-content:center;color:var(--text,#0D0D0D);font-size:20px;cursor:pointer}' +
      '.tk-msheet{display:none;flex-direction:column;gap:6px;padding:8px 0 18px;border-top:1px solid var(--border-soft,#EDEDF0)}' +
      '.tk-msheet.open{display:flex}' +
      '.tk-mgroup{display:flex;flex-direction:column;gap:2px;padding:6px 0;border-bottom:1px solid var(--border-soft,#EDEDF0)}.tk-mgroup:last-child{border-bottom:none}' +
      '.tk-mlabel{font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--subtle,#9A9AA2);padding:6px 12px 2px}' +
      '@media(max-width:900px){.tk-nav,.tk-login{display:none}.tk-burger{display:flex}}' +
      '@media(max-width:560px){.tk-getapp{display:none}}' +
      "</style>";
  }

  function mount() {
    var el = d.getElementById("tk-nav");
    if (!el) return;
    el.innerHTML = css() +
      '<header class="tk-header"><div class="tk-in">' +
        '<a class="tk-brand" href="/">Trekkr</a>' +
        desktopNav() +
        '<div class="tk-act">' +
          '<a class="tk-getapp" href="/app">Get the App</a>' +
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
