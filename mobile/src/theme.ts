import { useColorScheme } from "react-native";

// Trekkr brand tokens, theme-aware (light default + dark). Mirrors the web
// design system: orange #FF6A00, warm neutrals.
const light = {
  orange: "#FF6A00",
  orangeSoft: "#FFF1E7",
  orangeLine: "rgba(255,106,0,0.30)",
  ink: "#1A1614",
  mu: "#6C6660",
  faint: "#98918A",
  bg: "#F6F3F0",
  card: "#FFFFFF",
  line: "#E7E1DB",
  lineSoft: "#F0EBE6",
  green: "#0E8A4F",
  greenBg: "#E7F6ED",
  red: "#C2410C",
  amber: "#B7791F",
  amberBg: "#FBF1DC",
};

const dark: typeof light = {
  orange: "#FF7E22",
  orangeSoft: "#2A1B10",
  orangeLine: "rgba(255,126,34,0.34)",
  ink: "#F3EEE9",
  mu: "#ADA49B",
  faint: "#7C746C",
  bg: "#141110",
  card: "#1E1A18",
  line: "#302A26",
  lineSoft: "#241F1C",
  green: "#4ADE80",
  greenBg: "#12271B",
  red: "#F97316",
  amber: "#E7B85C",
  amberBg: "#2A2114",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

// Series Tier (T1/T2/T3) label from an ELO + dynamic cutoffs (percentile-based,
// fetched from /tiers/boundaries). Falls back to the absolute cutoffs.
export function tierName(elo: number, cut?: { t1: number; t2: number }): string {
  const t1 = cut?.t1 ?? 2000;
  const t2 = cut?.t2 ?? 1500;
  if (elo >= t1) return "T1 · Open";
  if (elo >= t2) return "T2 · Contender";
  return "T3 · Rising";
}
