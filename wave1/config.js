/* =====================================================================
 * TREKKR — WAVE 1 CONFIG (single source of truth)
 * ---------------------------------------------------------------------
 * Every figure here is a placeholder from the design draft (Build Spec §7).
 * These appear on the most visible screens in the product — replace them
 * with the real founder-confirmed values before/at launch.
 *
 * Wave 2 reads this same file. Do NOT inline these numbers into pages.
 * Access in the browser via `window.TREKKR_CONFIG` (alias `TREKKR`).
 * ===================================================================== */
(function () {
  "use strict";

  var CONFIG = {
    // --- Brand / meta ---------------------------------------------------
    brand: "Trekkr",
    waFallback: "https://wa.me/6281234567890", // used when a schedule row has no whatsappUrl

    // --- Championship ---------------------------------------------------
    championship: {
      // ISO date used for the live countdown (Build Spec acceptance #3:
      // countdown computes from this, never hardcoded days).
      date: "2026-12-13",
      city: "Jakarta",
      prizePool: 30000000, // Rp30,000,000 total
      places: 288,
      // One champion per tier. T1 highlighted on the hero.
      prizes: [
        { tier: "T1", label: "Open", amount: 15000000, highlight: true },
        { tier: "T2", label: "Contender", amount: 10000000, highlight: false },
        { tier: "T3", label: "Rising", amount: 5000000, highlight: false },
      ],
    },

    // --- Trekkr Series (monthly qualifiers) -----------------------------
    series: {
      prizePool: 9000000, // Rp9,000,000 per event
      prizes: [
        { tier: "T1", label: "Open", amount: 4000000 },
        { tier: "T2", label: "Contender", amount: 3000000 },
        { tier: "T3", label: "Rising", amount: 2000000 },
      ],
      minEntered: 2, // minimum Series a player must enter to qualify
      dates: [
        { iso: "2026-09-14", label: "14 Sep", name: "Series #1", venue: "The Field" },
        { iso: "2026-10-12", label: "12 Oct", name: "Series #2", venue: "The Field" },
        { iso: "2026-11-09", label: "9 Nov", name: "Series #3", venue: "The Field" },
      ],
    },

    // --- Qualifying -----------------------------------------------------
    qualifying: {
      close: "2026-11-30", // 30 November
      topN: 16, // finish top 16 in your tier
    },

    // --- RankPlay (ranked sessions) -------------------------------------
    rankPlay: {
      // Default price when a Schedule row omits pricePerPlayer.
      // Depends on the real court rate — confirm with the founder.
      pricePerPlayer: 172000, // Rp172,000
      // Night format (shown on the session detail page).
      arrive: "18:45",
      rounds: 12,      // rotating rounds run
      matchesEach: 8,  // matches each player actually plays
      freeCancelHours: 24,
    },

    // --- WAVE 2 (unbuilt) -----------------------------------------------
    // Tier definitions live here for Wave 2. Wave 1 does NOT render tiers:
    // the ELO replay must complete first, otherwise ~60% of calibrated
    // players would land in the wrong tier. Left in place, unused.
    tier: null,
    // Championship tier bands by ELO. Cutoffs confirmed with the founder:
    // T3 < 1500 | T2 1500–1999 | T1 ≥ 2000. NOTE: the same cutoffs are also
    // hardcoded in the shared display helpers (trekkr-api.js getTierName/
    // getTierClass/getNextTier and player/index.html tcCls/tierProg) — keep
    // them in sync if you change the bands here.
    tiers: [
      { id: "T1", label: "Open", min: 2000, max: Infinity },
      { id: "T2", label: "Contender", min: 1500, max: 1999 },
      { id: "T3", label: "Rising", min: 0, max: 1499 },
    ],
    // Tier eligibility. A player has no settled tier until calibrated
    // (minMatches). replayComplete flips to true after the season ELO replay
    // and clears the "provisional" note across the site. Mirrored in the shared
    // client (trekkr-api.js: MIN_TIER_MATCHES/REPLAY_COMPLETE) and on the
    // passport/rankings — keep them in sync.
    tierEligibility: { minMatches: 15, replayComplete: false },
  };

  window.TREKKR_CONFIG = CONFIG;
  window.TREKKR = CONFIG; // short alias
})();
