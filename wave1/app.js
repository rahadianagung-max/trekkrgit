/* =====================================================================
 * TREKKR — WAVE 1 SHARED CLIENT
 * ---------------------------------------------------------------------
 * One place for: the resilient fetch helper, the API client, formatters,
 * the live countdown, and the standalone three-session meter component.
 *
 * Reliability (Build Spec §2): the API returns HTTP 500 on ~20–40% of
 * requests at random; almost all recover on retry. EVERY fetch goes
 * through apiGet(), which retries with exponential backoff
 * (0.5s / 1s / 2s / 4s, up to 5 attempts). A page must never sit on a
 * "Loading…" spinner because a single call failed.
 * ===================================================================== */
(function () {
  "use strict";

  var API_BASE = "/api";
  var BACKOFF = [500, 1000, 2000, 4000]; // ms; 5 attempts total (1 + 4 retries)

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /**
   * GET a JSON endpoint with exponential-backoff retries.
   * Retries on network errors and any 5xx. Does NOT retry 4xx (client bug).
   * Throws after the final attempt so callers can degrade gracefully.
   */
  async function apiGet(path, opts) {
    opts = opts || {};
    var url = API_BASE + path;
    var lastErr;
    for (var attempt = 0; attempt <= BACKOFF.length; attempt++) {
      try {
        var res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
        if (res.status >= 500) throw new Error("HTTP " + res.status);
        if (!res.ok) {
          // 4xx — a real client error; retrying won't help.
          var msg = "HTTP " + res.status;
          try { var j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
          var err4 = new Error(msg); err4.status = res.status; throw err4;
        }
        return await res.json();
      } catch (e) {
        lastErr = e;
        if (e && e.status && e.status < 500) throw e; // don't retry 4xx
        if (attempt < BACKOFF.length) await sleep(BACKOFF[attempt]);
      }
    }
    throw lastErr || new Error("request failed");
  }

  /** POST JSON with the same backoff policy (safe: our writes are append-only). */
  async function apiPost(path, payload) {
    var url = API_BASE + path;
    var lastErr;
    for (var attempt = 0; attempt <= BACKOFF.length; attempt++) {
      try {
        var res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload || {}),
        });
        if (res.status >= 500) throw new Error("HTTP " + res.status);
        var data = null;
        try { data = await res.json(); } catch (e) {}
        if (!res.ok) {
          var err = new Error((data && data.error) || "HTTP " + res.status);
          err.status = res.status; throw err;
        }
        return data || {};
      } catch (e) {
        lastErr = e;
        if (e && e.status && e.status < 500) throw e;
        if (attempt < BACKOFF.length) await sleep(BACKOFF[attempt]);
      }
    }
    throw lastErr || new Error("request failed");
  }

  // --- Typed API helpers -----------------------------------------------
  var api = {
    /** GET /api/schedule?from&to&type → { schedule: [...] } (spotsLeft included) */
    schedule: function (q) {
      q = q || {};
      var qs = [];
      if (q.from) qs.push("from=" + encodeURIComponent(q.from));
      if (q.to) qs.push("to=" + encodeURIComponent(q.to));
      if (q.type) qs.push("type=" + encodeURIComponent(q.type));
      return apiGet("/schedule" + (qs.length ? "?" + qs.join("&") : ""));
    },
    leaderboard: function (limit) {
      return apiGet("/elo/leaderboard" + (limit ? "?limit=" + limit : ""));
    },
    players: function () { return apiGet("/players"); },
    // Wave 1 claim reuses the existing moderated flow so approvals land in the
    // admin "Edit Requests" screen and apply on approve (verified=TRUE, email
    // stored as Claim_Email). No separate inbox.
    editRequest: function (payload) { return apiPost("/players/edit-request", payload); },
    registerPlayer: function (payload) { return apiPost("/players/register", payload); },
  };

  // --- Formatters ------------------------------------------------------
  function rp(n) {
    n = Number(n) || 0;
    return "Rp" + n.toLocaleString("id-ID");
  }
  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  // Accent + case insensitive, for search matching.
  function foldText(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  // --- Dates -----------------------------------------------------------
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function parseISODate(iso) {
    // Treat as local calendar date (no timezone drift for date-only strings).
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function dayNum(iso) { var d = parseISODate(iso); return d ? d.getDate() : ""; }
  function monShort(iso) { var d = parseISODate(iso); return d ? MONTHS[d.getMonth()] : ""; }
  function monFull(iso) { var d = parseISODate(iso); return d ? MONTHS_FULL[d.getMonth()] : ""; }
  function dowShort(iso) { var d = parseISODate(iso); return d ? DAYS[d.getDay()] : ""; }
  function monthKey(iso) { var d = parseISODate(iso); return d ? d.getFullYear() * 12 + d.getMonth() : 0; }
  function monthLabel(iso) { var d = parseISODate(iso); return d ? MONTHS_FULL[d.getMonth()] + " " + d.getFullYear() : ""; }
  function longDate(iso) {
    var d = parseISODate(iso); if (!d) return "";
    return DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS_FULL[d.getMonth()] + " " + d.getFullYear();
  }
  function daysUntil(iso) {
    var d = parseISODate(iso); if (!d) return 0;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((d - today) / 86400000));
  }

  // --- Standalone component: three-session meter -----------------------
  // Build Spec §9 handoff: Wave 2 fills it with real progress.
  // state: array of 3 strings — "empty" | "now" | "done".
  // labels: optional array of 3 short labels.
  function sessionMeter(state, labels) {
    state = state || ["empty", "empty", "empty"];
    labels = labels || ["Session", "Session", "Ranked"];
    var html = '<div class="sesmeter" role="img" aria-label="Ranked session progress">';
    for (var i = 0; i < 3; i++) {
      var cls = state[i] === "done" ? " done" : state[i] === "now" ? " now" : "";
      html += '<div class="sesblock' + cls + '"><b>' + (i + 1) + "</b><span>" +
        (labels[i] || "Session") + "</span></div>";
    }
    return html + "</div>";
  }

  // --- Live countdown --------------------------------------------------
  // Writes days-remaining into an element; recomputes from the config date.
  function mountCountdown(el, iso) {
    if (!el) return;
    var render = function () { el.textContent = String(daysUntil(iso)); };
    render();
    // Re-render at the next local midnight so the number stays honest.
    var now = new Date();
    var nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    setTimeout(function () { render(); setInterval(render, 86400000); }, nextMidnight - now);
  }

  // --- Escape (all API strings are untrusted for the DOM) --------------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  window.TrekkrW1 = {
    apiGet: apiGet, apiPost: apiPost, api: api,
    rp: rp, initials: initials, foldText: foldText, esc: esc,
    dayNum: dayNum, monShort: monShort, monFull: monFull, dowShort: dowShort,
    monthKey: monthKey, monthLabel: monthLabel, longDate: longDate,
    daysUntil: daysUntil, parseISODate: parseISODate,
    sessionMeter: sessionMeter, mountCountdown: mountCountdown,
  };
})();
