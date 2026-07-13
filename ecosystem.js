/* ==========================================================================
   ecosystem.js — SportsActvd Ecosystem Kit (shared layer)
   Provides the two signature shared elements + the ELO formatter, per
   docs/ecosystem-revamp-brief.md §2 and §5.2. Vanilla JS, no dependencies,
   no build step. Keep identical across trekkr.online and turnamenpadel.com.

   Public API (also exposed as globals):
     renderEcosystemBar(currentSite)      inject the Ecosystem Bar (§2.2)
     renderEcosystemFooter(mount)         inject the shared 4-col footer (§2.4)
     formatElo(value, delta)              ELO markup: orange, mono, delta arrow

   Simplest wiring — one line per page, auto-inits on load:
     <script src="/ecosystem.js" data-site="trekkr"></script>
   It prepends the bar to <body> and fills any [data-eco-footer] mount.
   ========================================================================== */
(function (global) {
  "use strict";

  // The four ecosystem destinations. `tag` is the bar's secondary label;
  // `role` is the one-line description used in the mobile sheet and footer.
  var SITES = [
    { key: "trekkr",      name: "Trekkr",        tag: "Rankings",    role: "Check your rating",          url: "https://trekkr.online" },
    { key: "turnamen",    name: "TurnamenPadel", tag: "Tournaments", role: "Play verified tournaments",  url: "https://turnamenpadel.com" },
    { key: "stellar",     name: "Stellar",       tag: "Academy",     role: "Train with champions",       url: "https://stellarsquadacademy.com" },
    { key: "sportsactvd", name: "SportsActvd",   tag: "",            role: "Partner with us",            url: "https://sportsactvd.com" }
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // Append ?ref=<currentSite> so cross-sell traffic is measurable (§5.4).
  // Own-site links stay clean (no self-referential ref).
  function withRef(url, currentSite, site) {
    if (site && site.key === currentSite) return url;
    return url + (url.indexOf("?") === -1 ? "?" : "&") + "ref=" + encodeURIComponent(currentSite || "eco");
  }

  // -------------------------------------------------------------------------
  // §2.1 / §5.2  formatElo(value, delta) — the shared ELO renderer.
  // Returns markup: the rating in .elo (ember, tabular mono); when a delta is
  // given, a ▲ +N (court green) or ▼ −N (muted) chip is appended.
  // -------------------------------------------------------------------------
  function formatElo(value, delta) {
    var raw = Number(value);
    var v = (value === null || value === undefined || value === "" || isNaN(raw))
      ? "—" : Math.round(raw);
    var html = '<span class="elo">' + v + "</span>";
    if (delta !== null && delta !== undefined && delta !== "") {
      var d = Math.round(Number(delta));
      if (!isNaN(d)) {
        if (d > 0) html += '<span class="elo-delta elo-delta--up">▲ +' + d + "</span>";
        else if (d < 0) html += '<span class="elo-delta elo-delta--down">▼ −' + Math.abs(d) + "</span>";
        else html += '<span class="elo-delta elo-delta--flat">– 0</span>';
      }
    }
    return html;
  }

  // -------------------------------------------------------------------------
  // §2.2  The Ecosystem Bar
  // -------------------------------------------------------------------------
  function barLinksHtml(currentSite) {
    // Desktop middle links = the three destinations other than the wordmark.
    return SITES.filter(function (s) { return s.key !== "sportsactvd"; })
      .map(function (s) {
        var current = s.key === currentSite;
        var tag = s.tag ? ' <span class="eco-bar__tag">· ' + esc(s.tag) + "</span>" : "";
        if (current) {
          return '<span class="eco-bar__link eco-bar__link--current" aria-current="page">' +
            esc(s.name) + tag + "</span>";
        }
        return '<a class="eco-bar__link" href="' + esc(withRef(s.url, currentSite, s)) + '">' +
          esc(s.name) + tag + "</a>";
      })
      .join('<span class="eco-bar__sep" aria-hidden="true">|</span>');
  }

  function sheetItemsHtml(currentSite) {
    return SITES.map(function (s) {
      var current = s.key === currentSite;
      var tag = s.tag ? ' <span class="eco-bar__tag">· ' + esc(s.tag) + "</span>" : "";
      var inner =
        '<span class="eco-sheet__name">' + esc(s.name) + tag + "</span>" +
        '<span class="eco-sheet__role">' + esc(s.role) + "</span>";
      if (current) {
        return '<div class="eco-sheet__item eco-sheet__item--current" aria-current="page">' + inner + "</div>";
      }
      return '<a class="eco-sheet__item" href="' + esc(withRef(s.url, currentSite, s)) + '">' + inner + "</a>";
    }).join("");
  }

  function renderEcosystemBar(currentSite) {
    currentSite = currentSite || "trekkr";
    if (document.querySelector(".eco-bar")) return; // idempotent

    var elo = SITES[0]; // trekkr
    var eloHref = currentSite === "trekkr" ? "/rankings"
      : withRef(elo.url + "/rankings", currentSite, null);

    var bar = document.createElement("div");
    bar.className = "eco-bar";
    bar.setAttribute("role", "navigation");
    bar.setAttribute("aria-label", "SportsActvd ecosystem");
    bar.innerHTML =
      '<div class="eco-bar__inner">' +
        '<a class="eco-bar__brand" href="' + esc(withRef(SITES[3].url, currentSite, SITES[3])) + '">SPORTSACTVD</a>' +
        '<button class="eco-bar__toggle" type="button" aria-expanded="false" aria-controls="ecoSheet" aria-label="Open ecosystem menu">' +
          'SPORTSACTVD <span class="eco-caret" aria-hidden="true">▾</span>' +
        "</button>" +
        '<nav class="eco-bar__links" aria-label="Ecosystem sites">' + barLinksHtml(currentSite) + "</nav>" +
        '<a class="eco-bar__cta" href="' + esc(eloHref) + '">▸ What’s your ELO?</a>' +
      "</div>";

    var sheet = document.createElement("div");
    sheet.className = "eco-sheet";
    sheet.id = "ecoSheet";
    sheet.setAttribute("hidden", "");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-label", "SportsActvd ecosystem");
    sheet.innerHTML =
      '<div class="eco-sheet__backdrop" data-eco-close></div>' +
      '<div class="eco-sheet__panel">' +
        '<div class="eco-sheet__head">' +
          '<span class="eco-sheet__title">SPORTSACTVD</span>' +
          '<button class="eco-sheet__close" type="button" data-eco-close aria-label="Close menu">×</button>' +
        "</div>" +
        sheetItemsHtml(currentSite) +
      "</div>";

    document.body.insertBefore(bar, document.body.firstChild);
    document.body.insertBefore(sheet, bar.nextSibling);

    wireSheet(bar.querySelector(".eco-bar__toggle"), sheet);
  }

  function wireSheet(toggle, sheet) {
    if (!toggle) return;
    var closeBtn = sheet.querySelector(".eco-sheet__close");

    function open() {
      sheet.removeAttribute("hidden");
      // allow the element to paint before adding the transition class
      requestAnimationFrame(function () { sheet.classList.add("open"); });
      toggle.setAttribute("aria-expanded", "true");
      document.addEventListener("keydown", onKey);
      if (closeBtn) closeBtn.focus();
    }
    function close() {
      sheet.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      document.removeEventListener("keydown", onKey);
      var reduce = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var hide = function () { sheet.setAttribute("hidden", ""); };
      if (reduce) hide(); else setTimeout(hide, 220);
      toggle.focus();
    }
    function onKey(e) {
      if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); close(); }
    }

    toggle.addEventListener("click", function () {
      if (sheet.classList.contains("open")) close(); else open();
    });
    sheet.addEventListener("click", function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute("data-eco-close")) close();
    });
  }

  // -------------------------------------------------------------------------
  // §2.4  Shared 4-column footer
  // -------------------------------------------------------------------------
  function footerHtml(currentSite, utilityHtml) {
    var cols = SITES.map(function (s) {
      var head = (s.key === currentSite)
        ? '<span class="eco-footer__brand" aria-current="page">' + esc(s.name) + "</span>"
        : '<a class="eco-footer__brand" href="' + esc(withRef(s.url, currentSite, s)) + '">' + esc(s.name) + "</a>";
      return '<div class="eco-footer__col">' + head +
        '<div class="eco-footer__role">' + esc(s.role) + "</div></div>";
    }).join("");
    var utility = utilityHtml
      ? '<nav class="eco-footer__utility" aria-label="More on this site">' + utilityHtml + "</nav>"
      : "";
    return '<div class="eco-footer__inner">' +
      '<div class="eco-footer__cols">' + cols + "</div>" +
      utility +
      '<div class="eco-footer__bottom">' +
        '<span>© 2026 <span class="eco-footer__mark">SportsActvd</span> — Trekkr · TurnamenPadel · Stellar Academy</span>' +
      "</div></div>";
  }

  function renderEcosystemFooter(mount, currentSite) {
    currentSite = currentSite || "trekkr";
    var el = typeof mount === "string" ? document.querySelector(mount)
      : (mount || document.querySelector("[data-eco-footer]"));
    if (!el) {
      el = document.createElement("footer");
      document.body.appendChild(el);
    }
    // Preserve any site-specific links the page left in the mount as a
    // secondary utility row (e.g. Trekkr's Admin / Market Intelligence).
    var utilityHtml = (el.innerHTML || "").trim();
    // Promote the mount into the footer element itself.
    if (el.tagName !== "FOOTER") {
      var f = document.createElement("footer");
      el.parentNode.insertBefore(f, el);
      el.parentNode.removeChild(el);
      el = f;
    }
    el.className = "eco-footer";
    el.setAttribute("role", "contentinfo");
    el.innerHTML = footerHtml(currentSite, utilityHtml);
  }

  // -------------------------------------------------------------------------
  // §2.3  Player Passport Card — the second signature element.
  //
  // Grounded strictly in fields the current Trekkr payload already returns
  // (inspected in api/sheet.js getPlayerDetail / getNationalLeaderboard):
  //   name / displayName, elo|currentElo, totalMatches, winRate, streak,
  //   level, region, photoUrl, tournaments (col K, comma-sep EVENT NAMES),
  //   winnerAt (col J, comma-sep events won).
  // Accepts either a leaderboard row (flat) or a getPlayerDetail response
  // ({ player, stats }). Pass opts.rank for the board position.
  //
  // TODO(ecosystem): fields that do NOT exist in the payload yet, so their
  //   chips are intentionally omitted (brief §2.3):
  //     • academy level  — no Stellar Academy field on the player row.
  //     • "last event"    — no timestamped last-event name available.
  //     • per-event deep links — `tournaments` gives event NAMES only, no
  //       Tournament/Event ID, so chips link to turnamenpadel.com (ref) as a
  //       best-effort until canonical event IDs are surfaced (brief §5).
  // -------------------------------------------------------------------------
  function pick() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v !== null && v !== undefined && v !== "") return v;
    }
    return undefined;
  }
  function initials(name) {
    return (String(name || "").trim().split(/\s+/).map(function (w) { return w[0] || ""; })
      .slice(0, 2).join("") || "?").toUpperCase();
  }
  function commaList(s) {
    return String(s || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function renderPassportCard(input, opts) {
    opts = opts || {};
    var pl = input.player || input;
    var st = input.stats || input;
    var name = String(pick(pl.displayName, pl.name, input.name, "")).trim();
    var elo = pick(st.currentElo, pl.elo, input.elo, 0);
    var matches = pick(st.totalMatches, pl.totalMatches, input.totalMatches, 0);
    var winRate = pick(st.winRate, pl.winRate, input.winRate);
    var streak = pick(st.streak, pl.streak, input.streak);
    var level = pick(pl.level, input.level, "");
    var region = pick(pl.region, input.region, "");
    var photo = pick(pl.photoUrl, input.photoUrl, "");
    var rank = pick(opts.rank, pl.rank, input.rank);
    var events = commaList(pick(pl.tournaments, input.tournaments, ""));
    var wonLc = commaList(pick(pl.winnerAt, input.winnerAt, "")).map(function (x) { return x.toLowerCase(); });

    var subParts = [];
    if (rank !== undefined && rank !== null && rank !== "") subParts.push("Rank #" + rank);
    if (region) subParts.push(region);
    if (level) subParts.push(level);

    var av = photo
      ? '<img class="pp-card__av" src="' + esc(photo) + '" alt="" loading="lazy"/>'
      : '<span class="pp-card__av pp-card__av--i">' + esc(initials(name)) + "</span>";

    var stats = [
      { v: Number(matches).toLocaleString("en-US"), l: "Matches" }
    ];
    if (winRate !== undefined && winRate !== null && winRate !== "") stats.push({ v: winRate + "%", l: "Win rate" });
    if (streak && streak !== "—") stats.push({ v: streak, l: "Streak" });
    var statsHtml = stats.map(function (s) {
      return '<div class="pp-card__stat"><span class="pp-card__stat-v">' + esc(s.v) +
        '</span><span class="pp-card__stat-l">' + esc(s.l) + "</span></div>";
    }).join("");

    // Provenance chips: one per tournament event; gold if the player won it.
    var CAP = 6;
    var chips = events.slice(0, CAP).map(function (evName) {
      var won = wonLc.indexOf(evName.toLowerCase()) !== -1;
      var href = withRef("https://turnamenpadel.com", "trekkr", null); // TODO: per-event deep link (brief §5)
      return '<a class="pp-chip' + (won ? " pp-chip--gold" : "") + '" href="' + esc(href) +
        '" title="Played at an official TurnamenPadel event">' +
        (won ? "🏆 " : "✓ ") + esc(evName) + "</a>";
    });
    if (events.length > CAP) chips.push('<span class="pp-chip pp-chip--more">+' + (events.length - CAP) + " more</span>");
    var chipsHtml = chips.length
      ? '<div class="pp-card__chips">' + chips.join("") +
        "<!-- TODO(ecosystem): academy-level chip omitted — no academy field in payload (brief §2.3) --></div>"
      : '<div class="pp-card__chips pp-card__chips--empty"><span class="pp-chip pp-chip--muted">No official events yet</span>' +
        "<!-- TODO(ecosystem): tournament + academy chips omitted — player has no tournaments field and no academy field --></div>";

    var full = opts.href || ("/player/" + String(pl.name || name).toLowerCase().replace(/[^a-z0-9]+/g, ""));
    var linkHtml = opts.hideLink ? "" :
      '<a class="pp-card__more" href="' + esc(full) + '">View full passport →</a>';

    return '<article class="pp-card">' +
      '<header class="pp-card__top">' +
        '<div class="pp-card__id">' + av +
          '<div class="pp-card__idtext"><h3 class="pp-card__name">' + esc(name.toUpperCase()) + "</h3>" +
          (subParts.length ? '<div class="pp-card__sub">' + esc(subParts.join(" · ")) + "</div>" : "") +
          "</div>" +
        "</div>" +
        '<div class="pp-card__elo"><span class="pp-card__elo-cap">ELO</span>' + formatElo(elo) + "</div>" +
      "</header>" +
      '<div class="pp-card__stats">' + statsHtml + "</div>" +
      chipsHtml + linkHtml +
    "</article>";
  }

  // ---- expose + auto-init ------------------------------------------------
  var api = {
    sites: SITES,
    renderEcosystemBar: renderEcosystemBar,
    renderEcosystemFooter: renderEcosystemFooter,
    renderPassportCard: renderPassportCard,
    formatElo: formatElo
  };
  global.Ecosystem = api;
  global.renderEcosystemBar = renderEcosystemBar;
  global.renderEcosystemFooter = renderEcosystemFooter;
  global.renderPassportCard = renderPassportCard;
  global.formatElo = formatElo;

  var self = document.currentScript;
  var site = (self && self.getAttribute("data-site")) || null;

  function init() {
    var s = site || "trekkr";
    renderEcosystemBar(s);
    if (document.querySelector("[data-eco-footer]")) renderEcosystemFooter(null, s);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
