import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { farmPlotStore, type FarmPlotDraft } from "../../../../src/storage/farmPlotStore";
import { getFarmPlotsByFarm, type FarmPlotResponse } from "../../../../src/api/farmPlots";
import { useSyncStatusStore } from "../../../../src/store/useSyncStatusStore";
import { Fonts } from "../../../../src/theme/fonts";

const GREEN = "#1B6B3A";

export default function FarmPlotsScreen() {
  const { farmId, farmName } = useLocalSearchParams<{ farmId: string; farmName?: string }>();
  const router = useRouter();
  const { isOnline } = useSyncStatusStore();

  const [plots, setPlots] = useState<FarmPlotDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Load from SQLite first (works offline)
      const local = await farmPlotStore.loadDraftsByFarm(farmId);
      setPlots(local);

      // If online, fetch from backend and upsert synced ones
      if (isOnline) {
        const remote: FarmPlotResponse[] = await getFarmPlotsByFarm(farmId);
        for (const r of remote) {
          await farmPlotStore.saveDraft({
            id: r.farmPlotId,
            farmId: r.farmId,
            name: r.name,
            description: r.description,
            area: r.area,
            polygon: r.polygon,
            status: 'synced',
            capturedOffline: r.capturedOffline,
            createdAt: new Date(r.createdAt),
            updatedAt: new Date(r.updatedAt),
          });
        }
        const refreshed = await farmPlotStore.loadDraftsByFarm(farmId);
        setPlots(refreshed);
      }
    } catch {
      setError("No se pudieron cargar los lotes.");
    } finally {
      setIsLoading(false);
    }
  }, [farmId, isOnline]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>← Volver</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title} numberOfLines={1}>
            {farmName ?? "Lotes de la finca"}
          </Text>
        </View>
        <Pressable
          onPress={load}
          disabled={!isOnline || isLoading}
          accessibilityLabel="Actualizar lotes"
        >
          <Text style={[styles.refreshBtn, (!isOnline || isLoading) && styles.refreshDisabled]}>
            Actualizar
          </Text>
        </Pressable>
      </View>

      {!isOnline ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Sin conexión — mostrando lotes guardados localmente</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator size="large" color={GREEN} style={styles.loader} />
      ) : (
        <FlatList
          data={plots}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Sin lotes registrados</Text>
              <Text style={styles.emptyDesc}>Toca "Capturar nuevo lote" para comenzar.</Text>
            </View>
          }
          renderItem={({ item }) => <PlotRow plot={item} />}
        />
      )}

      <View style={styles.footer}>
        <Pressable
          style={styles.captureBtn}
          onPress={() =>
            router.push({
              pathname: "/(tabs)/plots/capture/[farmId]",
              params: { farmId, farmName: farmName ?? "" },
            })
          }
          accessibilityRole="button"
        >
          <Text style={styles.captureBtnText}>+ Capturar nuevo lote</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function PlotRow({ plot }: { plot: FarmPlotDraft }) {
  const pointCount = plot.polygon.points.length;
  const isSynced = plot.status === 'synced';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.plotName}>{plot.name}</Text>
        <View style={[styles.badge, isSynced ? styles.badgeSynced : styles.badgeDraft]}>
          <Text style={isSynced ? styles.badgeSyncedText : styles.badgeDraftText}>
            {isSynced ? "Sincronizado" : "Borrador"}
          </Text>
        </View>
      </View>
      {plot.description ? (
        <Text style={styles.plotDesc} numberOfLines={1}>{plot.description}</Text>
      ) : null}
      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>{pointCount} punto{pointCount !== 1 ? "s" : ""}</Text>
        {plot.area ? (
          <Text style={styles.metaText}>{plot.area.toFixed(2)} ha</Text>
        ) : null}
        <Text style={styles.metaText}>{plot.createdAt.toLocaleDateString("es-CO")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 8,
  },
  backBtn: { paddingVertical: 4, paddingRight: 4 },
  backText: { fontSize: 14, fontFamily: Fonts.medium, color: GREEN },
  headerCenter: { flex: 1 },
  title: { fontSize: 16, fontFamily: Fonts.bold, color: "#111827" },
  refreshBtn: { fontSize: 14, fontFamily: Fonts.semiBold, color: GREEN },
  refreshDisabled: { color: "#9CA3AF" },

  offlineBanner: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
  },
  offlineText: { fontSize: 12, fontFamily: Fonts.regular, color: "#92400E" },

  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { fontSize: 13, fontFamily: Fonts.regular, color: "#DC2626" },

  loader: { marginTop: 48 },
  list: { padding: 16, gap: 12, paddingBottom: 90 },

  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: Fonts.semiBold, color: "#374151" },
  emptyDesc: { fontSize: 13, fontFamily: Fonts.regular, color: "#9CA3AF", textAlign: "center" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 6,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  plotName: { flex: 1, fontSize: 15, fontFamily: Fonts.semiBold, color: "#111827" },
  plotDesc: { fontSize: 13, fontFamily: Fonts.regular, color: "#6B7280" },
  cardMeta: { flexDirection: "row", gap: 12, marginTop: 2 },
  metaText: { fontSize: 12, fontFamily: Fonts.regular, color: "#6B7280" },

  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeSynced: { backgroundColor: "#DCFCE7" },
  badgeSyncedText: { fontSize: 11, fontFamily: Fonts.semiBold, color: GREEN },
  badgeDraft: { backgroundColor: "#FEF3C7" },
  badgeDraftText: { fontSize: 11, fontFamily: Fonts.semiBold, color: "#92400E" },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  captureBtn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  captureBtnText: { fontSize: 16, fontFamily: Fonts.semiBold, color: "#fff" },
});
