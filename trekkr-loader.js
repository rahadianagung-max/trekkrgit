/* Trekkr shared loading state — a slim progress bar with a rotating Trekkr/ELO
   fact underneath. One consistent look across every page; the caller passes a
   context title (e.g. "Building the rankings"). Self-contained and theme-agnostic:
   the fact text inherits the host page's color so it reads on any background,
   the title uses the brand gradient, and the track adapts via currentColor.
   Usage:
     var L = TrekkrLoader.mount(containerEl, "Building the rankings");
     ... when data is ready: L.stop();  (or just overwrite container.innerHTML)
   Honors prefers-reduced-motion (holds a still frame, no rotation). */
(function () {
  "use strict";
  var FACTS = [
    'Beat a team rated <b>above you</b> and you gain more ELO — upsets pay the most.',
    'Everyone on Trekkr starts at <b>1350</b>. Win and it climbs, lose and it dips.',
    '<b>Margin matters:</b> a decisive win boosts your ELO change by up to <b>+30%</b> vs a nail-biter.',
    'Padel is <b>2v2</b>, so Trekkr rates you against the <b>average</b> of the other team.',
    'A <b>400-point</b> ELO gap means the favourite is expected to win about <b>90%</b> of the time.',
    'Your rating is <b>provisional for your first 15 matches</b> — new players move faster, then settle.',
    'Tiers <b>T1 · T2 · T3</b> are cut from the <b>percentile of active players</b>, not fixed numbers.',
    'Lose <b>narrowly to a strong team</b> and it barely costs you — you were the underdog on paper.',
    'Win it <b>6–0</b> and you climb more than the same win at <b>6–4</b>.',
    'ELO was invented by physicist <b>Arpad Elo</b> for chess — Trekkr brings the same math to padel.'
  ];
  var CSS = ""
    + ".tkl{max-width:520px;margin:0 auto;padding:14px 4px;text-align:left;font-family:'Plus Jakarta Sans',system-ui,sans-serif}"
    + ".tkl-title{font-family:'Saira Condensed',system-ui,sans-serif;font-style:italic;font-weight:800;text-transform:uppercase;"
    +   "letter-spacing:-.01em;font-size:clamp(18px,4.5vw,22px);line-height:1;margin:0 0 12px;"
    +   "background:linear-gradient(90deg,#FF3830,#FFB000);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}"
    + ".tkl-bar{position:relative;height:8px;border-radius:999px;overflow:hidden;background:color-mix(in srgb,currentColor 13%,transparent)}"
    + ".tkl-fill{position:absolute;inset:0;width:38%;border-radius:999px;background:linear-gradient(90deg,#FF3830,#FFB000);"
    +   "box-shadow:0 0 12px -2px rgba(255,176,0,.7);animation:tklIndet 1.7s cubic-bezier(.5,0,.2,1) infinite}"
    + "@keyframes tklIndet{0%{left:-40%;width:38%}55%{width:52%}100%{left:100%;width:34%}}"
    + ".tkl-facts{margin-top:16px;min-height:52px}"
    + ".tkl-kick{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;opacity:.55;"
    +   "display:flex;align-items:center;gap:8px;margin-bottom:7px}"
    + ".tkl-pill{width:15px;height:15px;border-radius:50%;background:#FF6A00;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}"
    + ".tkl-pill::before{content:'';width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:inset -1px -1px 0 rgba(0,0,0,.15)}"
    + ".tkl-fact{font-size:15px;line-height:1.5;color:inherit;font-weight:500;transition:opacity .42s ease,transform .42s ease}"
    + ".tkl-fact b{color:#FF6A00;font-weight:800}"
    + ".tkl-fact.tkl-swap{opacity:0;transform:translateY(6px)}"
    + "@media (prefers-reduced-motion:reduce){.tkl-fill{animation:none;left:0;width:66%}.tkl-fact{transition:none}}";

  var injected = false;
  function injectCSS() {
    if (injected) return; injected = true;
    var s = document.createElement("style");
    s.setAttribute("data-tkl", "");
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function markup(title) {
    return '<div class="tkl" role="status" aria-live="polite">'
      + '<div class="tkl-title">' + esc(title || "Loading") + '</div>'
      + '<div class="tkl-bar"><span class="tkl-fill"></span></div>'
      + '<div class="tkl-facts"><div class="tkl-kick"><span class="tkl-pill"></span> Did you know</div>'
      + '<div class="tkl-fact"></div></div></div>';
  }
  function mount(el, title, opts) {
    if (!el) return { stop: function () {} };
    injectCSS();
    el.innerHTML = markup(title);
    var factEl = el.querySelector(".tkl-fact");
    var facts = (opts && opts.facts) || FACTS;
    var i = Math.floor(Math.random() * facts.length);
    factEl.innerHTML = facts[i];
    var reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches; } catch (e) {}
    if (reduce) return { stop: function () {} };
    var t = setInterval(function () {
      i = (i + 1) % facts.length;
      factEl.classList.add("tkl-swap");
      setTimeout(function () { if (factEl.isConnected) { factEl.innerHTML = facts[i]; factEl.classList.remove("tkl-swap"); } }, 420);
    }, (opts && opts.interval) || 3200);
    return { stop: function () { clearInterval(t); } };
  }
  window.TrekkrLoader = { mount: mount, html: markup, facts: FACTS };
})();
