/* ==========================================================================
   passport-insights.js — pure helpers that turn Player Passport data into
   plain-language answers ("so what?"). No DOM, no fetch: every function takes
   the data it needs, so the same code runs in the page and in node tests
   (tests/passport-insights.test.js).
   Sources (all read-only, nothing here changes ratings):
     history  = /api/players/<name> → history[] (ELO_Log rows: elo, delta, w, l, timestamp)
     matches  = /api/players/<name>/matches (recorded match rows)
     lb       = /api/elo/leaderboard (elo, gender, region, totalMatches per player)
   The rating rules mirrored in the copy live in api/sheet.js (TREKKR ELO ENGINE);
   the confirmed-level threshold is CALIB_MATCHES there (16).
   ========================================================================== */
(function (root) {
  "use strict";
  var DAY = 864e5;

  // "[Walk Over] 1", "Walk Out 2", "- Walk Out 1 -", "Name [walk Out]": not a played match.
  var WO_RE = /walk\s*-?\s*(over|out)|\bw\/o\b/i;
  function isWalkoverName(n) { return WO_RE.test(String(n || "")); }

  // Official level bands (same thresholds as trekkr-api.js getTierName / LEVEL_ELO).
  var TIERS = [["Beginner", 0], ["Upper Beginner", 900], ["Lower Bronze", 1200], ["Bronze", 1500],
    ["Upper Bronze", 1800], ["Silver", 2100], ["Gold", 2500], ["Platinum", 3000]];
  function tierOf(elo) {
    var i = 0; for (var k = 0; k < TIERS.length; k++) if (elo >= TIERS[k][1]) i = k;
    var cur = TIERS[i], nxt = TIERS[i + 1] || null;
    return { name: cur[0], min: cur[1], next: nxt ? nxt[0] : null, nextMin: nxt ? nxt[1] : null,
      ptsAway: nxt ? nxt[1] - elo : 0,
      progress: nxt ? Math.max(2, Math.min(100, Math.round((elo - cur[1]) / (nxt[1] - cur[1]) * 100))) : 100 };
  }
  // Liga Trekkr divisions (a separate thing from the level bands).
  function divisionOf(elo) {
    if (elo >= 2500) return { name: "Open", next: null, ceil: null };
    if (elo >= 1800) return { name: "Division 3", next: "Open", ceil: 2500 };
    if (elo >= 1200) return { name: "Division 2", next: "Division 3", ceil: 1800 };
    return { name: "Division 1", next: "Division 2", ceil: 1200 };
  }

  function rated(history) {
    return (history || []).filter(function (e) { return e && e.sessionId !== "INITIAL" && (Number(e.w || 0) + Number(e.l || 0)) > 0; });
  }
  function ts(e) { var t = Date.parse((e && e.timestamp) || ""); return isNaN(t) ? null : t; }

  // Rating change over the last `days` days: current rating minus the last rating
  // recorded before the window. `days` = null means all history (vs the first row).
  // matches = rated results inside the window (Σ w+l), so callers can refuse to
  // read a trend from too small a sample.
  function ratingChange(history, cur, days, now) {
    now = now || Date.now();
    var h = (history || []).filter(function (e) { return e && e.elo != null; });
    if (!h.length) return null;
    var cutoff = days == null ? null : now - days * DAY, base = null, matches = 0, spans = false;
    h.forEach(function (e) {
      var t = ts(e);
      if (cutoff != null && t != null && t <= cutoff) { base = Number(e.elo); spans = true; return; }
      if (e.sessionId !== "INITIAL") matches += Number(e.w || 0) + Number(e.l || 0);
    });
    if (base == null) base = Number(h[0].elo);
    return { delta: Math.round(Number(cur) - base), matches: matches, spansPeriod: cutoff == null ? true : spans };
  }

  // Periods worth offering: a window is only shown when the history reaches back
  // past its start (otherwise it would just repeat "all").
  function availablePeriods(history, now) {
    now = now || Date.now();
    var first = null;
    rated(history).forEach(function (e) { var t = ts(e); if (t != null && (first == null || t < first)) first = t; });
    if (first == null) return [];
    var out = [];
    [[30, "30 days"], [90, "90 days"]].forEach(function (p) { if (first < now - p[0] * DAY) out.push({ days: p[0], label: p[1] }); });
    out.push({ days: null, label: "All" });
    return out;
  }

  // One honest sentence about a period; null when the sample is too small.
  var MIN_TREND = 3;
  function describeChange(ch, days) {
    if (!ch) return null;
    var span = days == null ? "since your first recorded match" : "in the last " + days + " days";
    if (ch.matches === 0) return "No rated matches " + (days == null ? "yet" : span) + ", so your rating hasn't moved.";
    if (ch.matches < MIN_TREND) return "Only " + ch.matches + " rated match" + (ch.matches === 1 ? "" : "es") + " " + span + ". That's too few to call a trend.";
    if (Math.abs(ch.delta) < 10) return "Your rating has stayed about the same " + span + " (" + (ch.delta >= 0 ? "+" : "") + ch.delta + " over " + ch.matches + " matches).";
    return "Your rating went " + (ch.delta > 0 ? "up " : "down ") + Math.abs(ch.delta) + " points " + span + " (" + ch.matches + " rated matches).";
  }

  // Average rating points per win: early wins vs the last 5 (session rows are
  // split evenly over their matches). null when there are fewer than 8 wins.
  function winValue(history) {
    var w = [];
    rated(history).forEach(function (e) {
      var ww = Number(e.w || 0), ll = Number(e.l || 0), dd = Number(e.delta || 0);
      if (ww < 1 || ll > 0 || dd <= 0) return;
      for (var i = 0; i < ww; i++) w.push(dd / ww);
    });
    if (w.length < 8) return null;
    var avg = function (a) { return a.reduce(function (t, x) { return t + x; }, 0) / a.length; };
    var recent = w.slice(-5), early = w.slice(0, Math.max(3, Math.floor((w.length - 5) / 2)));
    return { early: Math.round(avg(early)), recent: Math.round(avg(recent) * 10) / 10, n: w.length };
  }

  // Average CURRENT rating of the real opponents in the last k matches (walkovers skipped).
  function opponentAverage(rows, eloMap, k) {
    if (!eloMap) return null; var v = [];
    (rows || []).filter(function (r) { return !r.wo; }).slice(-k).forEach(function (r) {
      String(r.opponents || "").split(" & ").forEach(function (n) {
        n = String(n || "").trim(); if (!n || isWalkoverName(n)) return;
        var e = eloMap[n.toLowerCase()]; if (e) v.push(Number(e));
      });
    });
    return v.length >= 3 ? Math.round(v.reduce(function (t, x) { return t + x; }, 0) / v.length) : null;
  }

  // Short verdict cards: the first is the headline, an optional second adds the "but…".
  // Wording describes the RATING, never claims technical skill.
  function verdicts(o) {
    var s = o.stats || {}, n = Number(s.totalMatches || 0), calib = o.calib || 16, out = [];
    if (s.unrated) return out;
    if (n < calib) {
      out.push({ cls: "warn", h: "Finding your level", p: n + " of " + calib + " matches played. " + (calib - n) + " more and your level is confirmed.",
        so: "SO WHAT? Your first " + calib + " matches move your rating faster while Trekkr works out where you belong." });
      return out;
    }
    var now = o.now || Date.now(), ch = o.change30 || { delta: 0 };
    var m = String(s.streak || "").match(/^(\d+)([WL])$/i), sk = m ? Number(m[1]) : 0, sw = !!(m && m[2].toUpperCase() === "W");
    var last = 0; rated(o.history).forEach(function (e) { var t = ts(e); if (t != null) last = Math.max(last, t); });
    var idle = last ? Math.floor((now - last) / DAY) : 0;
    if (idle > 45) out.push({ cls: "", h: "Time to get back on court", p: "Your last rated match was " + idle + " days ago.", so: "SO WHAT? Your rating only moves when you play." });
    else if (sw && sk >= 5) out.push({ cls: "hot", h: "You're on fire 🔥", p: "You haven't lost in " + sk + " rated matches." });
    else if (ch.delta >= 20) out.push({ cls: "hot", h: "Your rating is rising", p: "Up " + ch.delta + " points in the last 30 days." });
    else if (ch.delta <= -20) out.push({ cls: "warn", h: "Tough month", p: "Down " + Math.abs(ch.delta) + " points in the last 30 days.", so: "SO WHAT? Losses to stronger pairs cost less than losses to weaker ones. Your level is still " + o.tierName + "." });
    else if (!sw && sk >= 3) out.push({ cls: "warn", h: "Rough patch", p: sk + " losses in a row.", so: "SO WHAT? Streaks end. Try a partner you win with, or a match closer to your level." });
    else {
      var recent = rated(o.history).slice(-12), net = recent.reduce(function (t, e) { return t + Number(e.delta || 0); }, 0);
      if (recent.length >= 8 && Math.abs(net) < 15) out.push({ cls: "", h: "Holding steady", p: "Your rating has barely moved over your last " + recent.length + " rated results.", so: "SO WHAT? Wins against stronger pairs are what move you up." });
      else out.push({ cls: "", h: "Steady progress", p: ch.delta ? (ch.delta > 0 ? "+" : "") + ch.delta + " points in the last 30 days." : "No rating change in the last 30 days." });
    }
    var wv = winValue(o.history);
    if (wv && wv.recent <= wv.early * 0.4 && wv.recent < 8) {
      var opp = opponentAverage(o.rows, o.eloMap, 5);
      out.push({ cls: "", h: "…but your wins are getting smaller", p: "Early on, a win earned you +" + wv.early + " pts. Your last 5 wins earned +" + wv.recent + " each.",
        so: "SO WHAT? " + (opp ? "Your recent opponents average " + opp.toLocaleString("en-US") + ", so a win was expected. " : "You've mostly beaten lower-rated pairs, so a win was expected. ") + "Beating stronger pairs is worth more." });
    }
    return out;
  }

  // National standing among players with a confirmed level: gender, region, overall.
  function normName(x) { return String(x || "").toLowerCase().trim().replace(/\s+/g, " "); }
  function normRegion(r) { return String(r || "").toLowerCase().replace(/\b(kota|kab\.?|kabupaten)\b/g, " ").replace(/\s+/g, " ").trim(); }
  function standing(lb, names, calib) {
    calib = calib || 16;
    var mine = {}; (names || []).forEach(function (n) { if (n) mine[normName(n)] = 1; });
    var isMe = function (e) { return mine[normName(e.name)] || mine[normName(e.display)] || mine[normName(e.displayName)]; };
    var me = (lb || []).filter(isMe)[0]; if (!me) return null;
    if (Number(me.totalMatches || 0) < calib) return { notYet: calib - Number(me.totalMatches || 0) };
    var conf = lb.filter(function (e) { return Number(e.totalMatches || 0) >= calib && !isWalkoverName(e.name); })
      .sort(function (a, b) { return Number(b.elo) - Number(a.elo); });
    var rankIn = function (pop) { var i = pop.findIndex(isMe); return i < 0 ? null : { rank: i + 1, total: pop.length }; };
    var g = String(me.gender || "M").toUpperCase() === "F" ? "F" : "M", out = [];
    var gr = rankIn(conf.filter(function (e) { return (String(e.gender || "M").toUpperCase() === "F" ? "F" : "M") === g; }));
    if (gr) out.push({ rank: gr.rank, total: gr.total, a: g === "F" ? "Women" : "Men", b: "Indonesia", scope: "gender" });
    var rg = normRegion(me.region);
    if (rg) { var rp = conf.filter(function (e) { return normRegion(e.region) === rg; }), rr = rankIn(rp); if (rr && rp.length >= 5) out.push({ rank: rr.rank, total: rr.total, a: "All players", b: me.region, scope: "region" }); }
    var ov = rankIn(conf); if (ov) out.push({ rank: ov.rank, total: ov.total, a: "All players", b: "Indonesia", scope: "overall" });
    return { items: out.slice(0, 3) };
  }

  // Put each ELO_Log change on the match it belongs to. One ELO row can cover a
  // whole session (w+l matches): it is expanded into that many slots and the change
  // sits on the session's last match. Walkovers never got rating rows, so they are
  // skipped; alignment runs from the newest match backwards. Mutates rows.
  function alignDeltas(rows, history) {
    var slots = [];
    rated(history).forEach(function (e) {
      var k = Number(e.w || 0) + Number(e.l || 0);
      for (var j = 1; j < k; j++) slots.push(null);
      slots.push({ delta: Number(e.delta || 0), elo: e.elo, k: k });
    });
    var played = (rows || []).filter(function (r) { return !r.wo; });
    for (var i = 1; i <= played.length && i <= slots.length; i++) {
      var row = played[played.length - i], s = slots[slots.length - i];
      if (s) { row.delta = s.delta; row.newElo = s.elo; row.deltaSession = s.k > 1; }
    }
    return rows;
  }

  var api = { isWalkoverName: isWalkoverName, tierOf: tierOf, divisionOf: divisionOf, ratingChange: ratingChange,
    availablePeriods: availablePeriods, describeChange: describeChange, winValue: winValue, opponentAverage: opponentAverage,
    verdicts: verdicts, standing: standing, alignDeltas: alignDeltas, MIN_TREND: MIN_TREND, TIERS: TIERS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PPI = api;
})(typeof window !== "undefined" ? window : this);
