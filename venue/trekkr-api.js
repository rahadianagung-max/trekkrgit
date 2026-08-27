const TrekkrAPI = (() => {
  // Always call API on main domain — subdomains rewrite paths and break /api/.
  // Vercel preview deploys (*.vercel.app) call their own /api so a preview can be
  // tested end-to-end (e.g. against Supabase) instead of hitting production.
  const BASE = (window.location.hostname === "trekkr.online" || window.location.hostname.endsWith(".vercel.app"))
    ? "/api"
    : "https://trekkr.online/api";

  function getToken() {
    return localStorage.getItem("trekkr_token") || "";
  }

  async function request(path, options = {}) {
    const url = `${BASE}/${path}`;
    const config = {
      headers: {
        "Content-Type": "application/json",
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      ...options,
    };
    try {
      const res = await fetch(url, config);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } catch (err) {
      console.error(`[TrekkrAPI] ${path} failed:`, err);
      throw err;
    }
  }

  return {
    async login(username, password) {
      const data = await request("auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      if (data.token) {
        localStorage.setItem("trekkr_token", data.token);
        localStorage.setItem("trekkr_role", data.role);
        localStorage.setItem("trekkr_venue", data.venue);
        localStorage.setItem("trekkr_user", data.username);
      }
      return data;
    },
    logout() {
      localStorage.removeItem("trekkr_token");
      localStorage.removeItem("trekkr_role");
      localStorage.removeItem("trekkr_venue");
      localStorage.removeItem("trekkr_user");
    },
    getSession() {
      return {
        token: getToken(),
        role: localStorage.getItem("trekkr_role") || "",
        venue: localStorage.getItem("trekkr_venue") || "",
        username: localStorage.getItem("trekkr_user") || "",
      };
    },

    async getPlayers(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return request(`players${qs ? `?${qs}` : ""}`);
    },
    async getPlayerDetail(name) {
      return request(`players/${encodeURIComponent(name)}`);
    },
    async addPlayer(data) {
      return request("players", { method: "POST", body: JSON.stringify(data) });
    },
    async updatePlayer(name, updates) {
      return request("players/update", {
        method: "PUT",
        body: JSON.stringify({ name, updates }),
      });
    },
    async claimProfile(name, ig_handle, session_id) {
      return request("players/claim", {
        method: "POST",
        body: JSON.stringify({ name, ig_handle, session_id }),
      });
    },

    async getVenues() {
      return request("venues");
    },
    async addVenue(data) {
      return request("venues", { method: "POST", body: JSON.stringify(data) });
    },
    async updateVenue(name, updates) {
      return request("venues/update", {
        method: "PUT",
        body: JSON.stringify({ name, updates }),
      });
    },
    async getVenueMatches(venue, params = {}) {
      const qs = new URLSearchParams(params).toString();
      return request(
        `venues/${encodeURIComponent(venue)}/matches${qs ? `?${qs}` : ""}`
      );
    },
    async addVenueMatch(venue, matches) {
      return request(`venues/${encodeURIComponent(venue)}/matches`, {
        method: "POST",
        body: JSON.stringify({ matches }),
      });
    },
    async getVenueWeeklyRanking(venue, params = {}) {
      const qs = new URLSearchParams(params).toString();
      const response = await request(
        `venues/${encodeURIComponent(venue)}/ranking${qs ? `?${qs}` : ""}`
      );
      
      // Tambahkan logika sorting kustom di sini
      if (response && response.ranking) {
        response.ranking.sort((a, b) => {
          // 1. Urutkan berdasarkan Win (w) terbesar ke terkecil
          if (b.w !== a.w) {
            return b.w - a.w; 
          }
          // 2. Jika Win sama, urutkan berdasarkan ELO terbesar ke terkecil
          return (b.elo || 0) - (a.elo || 0);
        });
      }
      
      return response;
    },

    async saveSession(data) {
      return request("sessions", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    async listSessions(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return request(`sessions${qs ? `?${qs}` : ""}`);
    },

    async getLatestElo() {
      return request("elo/latest");
    },
    async getEloHistory(player) {
      return request(`elo/history?player=${encodeURIComponent(player)}`);
    },
    async getNationalLeaderboard(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return request(`elo/leaderboard${qs ? `?${qs}` : ""}`);
    },

    async parseUrl(url, venue, gender) {
      return request("parse", {
        method: "POST",
        body: JSON.stringify({ url, venue, gender }),
      });
    },

    async getAdmins() {
      return request("admins");
    },
    async addAdmin(data) {
      return request("admins", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async getSettings() {
      return request("settings");
    },
    async updateSettings(settings) {
      return request("settings", {
        method: "PUT",
        body: JSON.stringify({ settings }),
      });
    },

    getTierName(elo) {
      // Championship tiers (Wave 1). Cutoffs: T3 < 1500 | T2 1500-1999 | T1 >= 2000.
      if (elo >= 2000) return "T1 · Open";
      if (elo >= 1500) return "T2 · Contender";
      return "T3 · Rising";
    },
    getTierClass(elo) {
      if (elo >= 2000) return "tier-t1";
      if (elo >= 1500) return "tier-t2";
      return "tier-t3";
    },
    getNextTier(elo) {
      const tiers = [
        { name: "T2 · Contender", min: 1500 },
        { name: "T1 · Open", min: 2000 },
      ];
      for (const t of tiers) {
        if (elo < t.min) return { name: t.name, ptsAway: t.min - elo };
      }
      return null;
    },
    // Tier eligibility (Wave 1). A player has no settled tier until calibrated
    // (>= MIN_TIER_MATCHES matches). REPLAY_COMPLETE flips to true after the
    // season ELO replay and clears the "provisional" note shown across the site.
    MIN_TIER_MATCHES: 15,
    REPLAY_COMPLETE: false,
    isTierEligible(totalMatches) { return (Number(totalMatches) || 0) >= this.MIN_TIER_MATCHES; },
  };
})();
