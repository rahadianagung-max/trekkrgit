/* Trekkr Player PWA — API + Supabase config. Public values (same as web client). */
(function (w) {
  "use strict";

  // Same-origin /api only on production (trekkr.online). Everywhere else —
  // Vercel preview deploys, localhost — call the production API directly, which
  // sends Access-Control-Allow-Origin:* and always has the Supabase env set.
  var host = w.location.hostname;
  var API_BASE = (host === "trekkr.online") ? "/api" : "https://trekkr.online/api";

  var SUPABASE_URL = "https://ftkbankqixnwssfrbqyc.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0a2JhbmtxaXhud3NzZnJicXljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3ODg0MDEsImV4cCI6MjEwMzM2NDQwMX0.RWVf6xehxQ9BPSK3ykDW8cikP9O5gvGRINwj9TAMaJQ";

  // Supabase client (session persists in localStorage, auto-refresh).
  var sb = w.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  async function request(path, opts) {
    opts = opts || {};
    var res = await fetch(API_BASE + "/" + path, {
      method: opts.method || "GET",
      headers: Object.assign(
        { "Content-Type": "application/json" },
        opts.token ? { Authorization: "Bearer " + opts.token } : {}
      ),
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error((data && data.error) || "HTTP " + res.status);
    return data;
  }

  function qs(params) {
    var p = new URLSearchParams();
    Object.keys(params || {}).forEach(function (k) { if (params[k] != null && params[k] !== "") p.set(k, params[k]); });
    var s = p.toString();
    return s ? "?" + s : "";
  }

  var API = {
    base: API_BASE,
    sb: sb,
    accountMe: function (token) { return request("account/me?token=" + encodeURIComponent(token)); },
    getPlayer: function (name) { return request("players/" + encodeURIComponent(name)); },
    getPlayerMatches: function (name) { return request("players/" + encodeURIComponent(name) + "/matches"); },
    getEloHistory: function (name) { return request("elo/history?player=" + encodeURIComponent(name)); },
    getLeaderboard: function (params) { return request("elo/leaderboard" + qs(params)); },
    getTierBoundaries: function () { return request("tiers/boundaries"); },
    // Edit own profile. `updates` may include display_name, ig, gender, region,
    // clubs, and photo (base64 data URL → uploaded server-side).
    updateProfile: function (token, updates) { return request("account/profile", { method: "PUT", body: { token: token, updates: updates } }); },
    changePassword: function (token, newPassword) { return request("account/change-password", { method: "POST", body: { token: token, new_password: newPassword } }); },
    forgotPassword: function (email) { return request("account/forgot", { method: "POST", body: { email: email } }); },
    getSchedule: function (params) { return request("schedule" + qs(params)); },
    getVenues: function () { return request("venues"); },
    getTrackedEvents: function () { return request("tracked-events"); },
    // Registration / claim (in-app, mirrors the web /join flow).
    checkName: function (name) { return request("players/check-name?name=" + encodeURIComponent(name)); },
    // Raw POST that resolves { ok, status, data } (never throws) so callers can
    // read fields like `claim` on a 409 race.
    send: function (path, body, method) {
      return fetch(API_BASE + "/" + path, {
        method: method || "POST",
        headers: { "Content-Type": "application/json" },
        body: body != null ? JSON.stringify(body) : undefined,
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d || {} }; });
      });
    },
    registerNew: function (body) { return this.send("account/register-new", body); },
    claimProfile: function (body) { return this.send("account/claim", body); },
  };

  // Series Tier label from ELO + dynamic cutoffs (fallback to absolute).
  API.tierName = function (elo, cut) {
    var t1 = (cut && cut.t1) || 2000, t2 = (cut && cut.t2) || 1500;
    if (elo >= t1) return "T1 · Open";
    if (elo >= t2) return "T2 · Contender";
    return "T3 · Rising";
  };
  // 8-level ELO tier name (absolute skill ladder).
  API.eloTier = function (elo) {
    if (elo >= 3000) return "Platinum";
    if (elo >= 2500) return "Gold";
    if (elo >= 2100) return "Silver";
    if (elo >= 1800) return "Upper Bronze";
    if (elo >= 1500) return "Bronze";
    if (elo >= 1200) return "Lower Bronze";
    if (elo >= 900) return "Upper Beginner";
    return "Beginner";
  };

  w.TrekkrAPI = API;
})(window);
