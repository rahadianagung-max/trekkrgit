import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, RefreshControl,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { api, type TierCut } from "@/lib/api";
import { useTheme, tierName } from "@/theme";

type Loaded = {
  name: string;
  displayName?: string;
  elo: number | null;
  wins?: number;
  losses?: number;
  matches?: number;
  unrated?: boolean;
  region?: string;
  clubs?: string;
  history: { elo: number; delta: number; timestamp: string }[];
};

export default function PassportScreen() {
  const t = useTheme();
  const { token, signOut } = useAuth();
  const [data, setData] = useState<Loaded | null>(null);
  const [cut, setCut] = useState<TierCut | undefined>(undefined);
  const [state, setState] = useState<"loading" | "ready" | "noplayer" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const me = await api.accountMe(token);
      if (!me.player?.name) { setState("noplayer"); return; }
      const name = me.player.name;
      const [detail, hist, boundaries] = await Promise.all([
        api.getPlayer(name).catch(() => ({})),
        api.getEloHistory(name).catch(() => ({ history: [] })),
        api.getTierBoundaries().catch(() => undefined),
      ]);
      const d: any = detail || {};
      const elo =
        d.currentElo ?? d.elo ?? me.player.elo ??
        (hist.history?.length ? hist.history[hist.history.length - 1].elo : null);
      setData({
        name,
        displayName: d.displayName || me.player.displayName || name,
        elo: d.unrated ? null : (typeof elo === "number" ? elo : null),
        wins: d.wins ?? d.totalWins,
        losses: d.losses ?? d.totalLosses,
        matches: d.totalMatches ?? d.matches ?? hist.history?.reduce((a: number, h: any) => a + (h.w || 0) + (h.l || 0), 0),
        unrated: !!d.unrated,
        region: d.region || me.player.region,
        clubs: d.clubs || me.player.clubs,
        history: (hist.history || []).slice(-8).reverse(),
      });
      setCut(boundaries);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (state === "loading") return <Center t={t}><ActivityIndicator color={t.orange} /></Center>;

  if (state === "noplayer")
    return (
      <Center t={t}>
        <Text style={[st.msg, { color: t.ink }]}>Akunmu belum tertaut ke profil pemain.</Text>
        <Text style={[st.msgSub, { color: t.mu }]}>Klaim profilmu di trekkr.online/join, lalu tunggu persetujuan admin.</Text>
        <LogoutBtn t={t} onPress={signOut} />
      </Center>
    );

  if (state === "error" || !data)
    return (
      <Center t={t}>
        <Text style={[st.msg, { color: t.ink }]}>Gagal memuat passport.</Text>
        <Pressable onPress={load} style={[st.retry, { borderColor: t.line }]}>
          <Text style={{ color: t.orange, fontWeight: "700" }}>Coba lagi</Text>
        </Pressable>
        <LogoutBtn t={t} onPress={signOut} />
      </Center>
    );

  const tier = data.elo != null ? tierName(data.elo, cut) : "Belum ada rating";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.orange} />}
    >
      <Text style={[st.hi, { color: t.faint }]}>PASSPORT</Text>
      <Text style={[st.name, { color: t.ink }]}>{data.displayName}</Text>
      {!!(data.region || data.clubs) && (
        <Text style={[st.meta, { color: t.mu }]}>{[data.region, (data.clubs || "").split(",")[0]].filter(Boolean).join(" · ")}</Text>
      )}

      {/* ELO card */}
      <View style={[st.card, { backgroundColor: t.card, borderColor: t.line }]}>
        {data.elo != null ? (
          <>
            <Text style={[st.eloNum, { color: t.orange }]}>{data.elo}</Text>
            <Text style={[st.eloLbl, { color: t.mu }]}>ELO</Text>
            <View style={[st.tier, { backgroundColor: t.orangeSoft, borderColor: t.orangeLine }]}>
              <Text style={[st.tierTxt, { color: t.orange }]}>{tier}</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={[st.eloNum, { color: t.faint, fontSize: 34 }]}>Unrated</Text>
            <Text style={[st.eloLbl, { color: t.mu }]}>Rating muncul setelah match PlayRank pertama</Text>
          </>
        )}
      </View>

      {/* Stats */}
      {(data.wins != null || data.matches != null) && (
        <View style={st.stats}>
          <Stat t={t} label="Menang" value={data.wins ?? "–"} />
          <Stat t={t} label="Kalah" value={data.losses ?? "–"} />
          <Stat t={t} label="Match" value={data.matches ?? "–"} />
        </View>
      )}

      {/* History */}
      {data.history.length > 0 && (
        <>
          <Text style={[st.section, { color: t.faint }]}>RIWAYAT ELO</Text>
          <View style={[st.card, { backgroundColor: t.card, borderColor: t.line, padding: 4 }]}>
            {data.history.map((h, i) => {
              const up = (h.delta || 0) >= 0;
              return (
                <View key={i} style={[st.hrow, { borderBottomColor: t.lineSoft, borderBottomWidth: i === data.history.length - 1 ? 0 : 1 }]}>
                  <Text style={[st.hdate, { color: t.mu }]}>{fmtDate(h.timestamp)}</Text>
                  <Text style={[st.helo, { color: t.ink }]}>{h.elo}</Text>
                  <Text style={{ color: up ? t.green : t.red, fontWeight: "700", width: 56, textAlign: "right" }}>
                    {up ? "▲ +" : "▼ "}{Math.abs(h.delta || 0)}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      <LogoutBtn t={t} onPress={signOut} />
    </ScrollView>
  );
}

function Stat({ t, label, value }: { t: any; label: string; value: any }) {
  return (
    <View style={[st.stat, { backgroundColor: t.card, borderColor: t.line }]}>
      <Text style={[st.statVal, { color: t.ink }]}>{value}</Text>
      <Text style={[st.statLbl, { color: t.mu }]}>{label}</Text>
    </View>
  );
}

function Center({ t, children }: { t: any; children: React.ReactNode }) {
  return <View style={[st.center, { backgroundColor: t.bg }]}>{children}</View>;
}

function LogoutBtn({ t, onPress }: { t: any; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.logout, { borderColor: t.line }]}>
      <Text style={{ color: t.mu, fontWeight: "700" }}>Keluar</Text>
    </Pressable>
  );
}

function fmtDate(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 },
  msg: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  msgSub: { fontSize: 13.5, textAlign: "center", lineHeight: 20 },
  retry: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6 },
  hi: { fontSize: 11.5, fontWeight: "800", letterSpacing: 1.4 },
  name: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5, marginTop: 4 },
  meta: { fontSize: 13.5, marginTop: 3 },
  card: { borderWidth: 1, borderRadius: 16, padding: 22, marginTop: 18, alignItems: "center" },
  eloNum: { fontSize: 56, fontWeight: "800", letterSpacing: -1, fontVariant: ["tabular-nums"] },
  eloLbl: { fontSize: 12.5, fontWeight: "600", marginTop: 2 },
  tier: { marginTop: 12, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  tierTxt: { fontWeight: "800", fontSize: 14 },
  stats: { flexDirection: "row", gap: 10, marginTop: 12 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  statVal: { fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"] },
  statLbl: { fontSize: 12, marginTop: 2 },
  section: { fontSize: 11.5, fontWeight: "800", letterSpacing: 1.2, marginTop: 24, marginBottom: 8 },
  hrow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14 },
  hdate: { flex: 1, fontSize: 13.5 },
  helo: { width: 60, textAlign: "right", fontWeight: "700", fontVariant: ["tabular-nums"] },
  logout: { alignSelf: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 26, paddingVertical: 12, marginTop: 30 },
});
