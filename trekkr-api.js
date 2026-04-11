const TrekkrAPI = (() => {
  const BASE = "https://trekkr.online/api";

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
      return request(
        `venues/${encodeURIComponent(venue)}/ranking${qs ? `?${qs}` : ""}`
      );
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

    getTierName(elo) {
      if (elo >= 3000) return "Platinum";
      if (elo >= 2500) return "Gold";
      if (elo >= 2100) return "Silver";
      if (elo >= 1800) return "Upper Bronze";
      if (elo >= 1500) return "Bronze";
      if (elo >= 1200) return "Lower Bronze";
      if (elo >= 900) return "Upper Beginner";
      return "Beginner";
    },
    getTierClass(elo) {
      if (elo >= 3000) return "tier-platinum";
      if (elo >= 2500) return "tier-gold";
      if (elo >= 2100) return "tier-silver";
      if (elo >= 1800) return "tier-ubronze";
      if (elo >= 1500) return "tier-bronze";
      if (elo >= 1200) return "tier-lbronze";
      if (elo >= 900) return "tier-ubeginner";
      return "tier-beginner";
    },
    getNextTier(elo) {
      const tiers = [
        { name: "Upper Beginner", min: 900 },
        { name: "Lower Bronze", min: 1200 },
        { name: "Bronze", min: 1500 },
        { name: "Upper Bronze", min: 1800 },
        { name: "Silver", min: 2100 },
        { name: "Gold", min: 2500 },
        { name: "Platinum", min: 3000 },
      ];
      for (const t of tiers) {
        if (elo < t.min) return { name: t.name, ptsAway: t.min - elo };
      }
      return null;
    },
  };
})();
