import { API_BASE } from "@/config";

// Thin client over the existing Trekkr REST API (/api/*). Mirrors the browser
// trekkr-api.js: pass the Supabase access token as a Bearer for authed calls.

type Opts = { token?: string | null; method?: string; body?: unknown };

async function request<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `HTTP ${res.status}`);
  return data as T;
}

export type PlayerSummary = {
  name: string;
  displayName?: string;
  elo?: number;
  gender?: string;
  region?: string;
  photoUrl?: string;
  clubs?: string;
  verified?: boolean;
  totalMatches?: number;
  unrated?: boolean;
};

export type EloPoint = { elo: number; delta: number; w: number; l: number; timestamp: string };
export type MatchRow = Record<string, any>;
export type TierCut = { t1: number; t2: number; n?: number; method?: string };

export const api = {
  // The logged-in user's linked player (name) + account info.
  accountMe: (token: string) =>
    request<{ email: string; player: PlayerSummary | null; claim: any }>(
      `account/me?token=${encodeURIComponent(token)}`
    ),

  // Public player passport detail by canonical name.
  getPlayer: (name: string) => request<any>(`players/${encodeURIComponent(name)}`),

  // Match history (used for passport partner/record).
  getPlayerMatches: (name: string) =>
    request<any>(`players/${encodeURIComponent(name)}/matches`),

  // ELO history (trajectory) for one player.
  getEloHistory: (name: string) =>
    request<{ player: string; history: EloPoint[] }>(
      `elo/history?player=${encodeURIComponent(name)}`
    ),

  // National leaderboard (optionally filtered).
  getLeaderboard: (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).reduce((a, [k, v]) => ((a[k] = String(v)), a), {} as Record<string, string>)
    ).toString();
    return request<{ leaderboard: any[] }>(`elo/leaderboard${qs ? `?${qs}` : ""}`);
  },

  // Percentile Series-Tier cutoffs.
  getTierBoundaries: () => request<TierCut>("tiers/boundaries"),
};
