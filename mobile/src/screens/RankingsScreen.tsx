import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { api, type TierCut } from "@/lib/api";
import { useTheme, tierName } from "@/theme";

type Row = { name: string; elo: number; region?: string; clubs?: string; totalMatches?: number };

export default function RankingsScreen() {
  const t = useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [cut, setCut] = useState<TierCut | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [lb, boundaries] = await Promise.all([
        api.getLeaderboard({ limit: 100 }),
        api.getTierBoundaries().catch(() => undefined),
      ]);
      // Only ranked (calibrated) players, sorted by ELO desc.
      const list = (lb.leaderboard || [])
        .filter((p: any) => (Number(p.totalMatches) || 0) >= 15)
        .map((p: any) => ({ name: p.name, elo: Number(p.elo) || 0, region: p.region, clubs: p.clubs, totalMatches: p.totalMatches }))
        .sort((a: Row, b: Row) => b.elo - a.elo);
      setRows(list);
      setCut(boundaries);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) return <View style={[s.center, { backgroundColor: t.bg }]}><ActivityIndicator color={t.orange} /></View>;

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      data={rows}
      keyExtractor={(item, i) => item.name + i}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.orange} />}
      ListHeaderComponent={
        <View style={{ marginBottom: 10 }}>
          <Text style={[s.title, { color: t.ink }]}>Rankings</Text>
          <Text style={[s.subtitle, { color: t.mu }]}>Pemain terkalibrasi (≥15 match)</Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <View style={[s.row, { borderBottomColor: t.lineSoft }]}>
          <Text style={[s.rank, { color: index < 3 ? t.orange : t.faint }]}>{index + 1}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.name, { color: t.ink }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[s.meta, { color: t.mu }]} numberOfLines={1}>
              {tierName(item.elo, cut)}{item.region ? ` · ${item.region}` : ""}
            </Text>
          </View>
          <Text style={[s.elo, { color: t.ink }]}>{item.elo}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={{ color: t.mu, textAlign: "center", marginTop: 40 }}>Belum ada data.</Text>}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  rank: { width: 30, fontSize: 16, fontWeight: "800", textAlign: "center", fontVariant: ["tabular-nums"] },
  name: { fontSize: 15.5, fontWeight: "700" },
  meta: { fontSize: 12.5, marginTop: 1 },
  elo: { fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] },
});
