import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { farmPlotStore, type FarmPlotDraft } from "../../../src/storage/farmPlotStore";
import { getFarmPlotsByFarm, type FarmPlotResponse } from "../../../src/api/farmPlots";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";

export default function FarmPlotsScreen() {
  const { farmId, farmName } = useLocalSearchParams<{ farmId: string; farmName?: string }>();
  const router = useRouter();
  const { isOnline } = useSyncStatusStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
        <ActivityIndicator size="large" color={colors.brand} style={styles.loader} />
      ) : (
        <FlatList
          data={plots}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Sin lotes registrados</Text>
              <Text style={styles.emptyDesc}>Toca &quot;Capturar nuevo lote&quot; para comenzar.</Text>
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
              pathname: "/plots/capture/[farmId]",
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },

    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 8,
    },
    backBtn: { paddingVertical: 4, paddingRight: 4 },
    backText: { fontSize: 14, fontFamily: Fonts.medium, color: colors.brand },
    headerCenter: { flex: 1 },
    title: { fontSize: 16, fontFamily: Fonts.bold, color: colors.textPrimary },
    refreshBtn: { fontSize: 14, fontFamily: Fonts.semiBold, color: colors.brand },
    refreshDisabled: { color: colors.textMuted },

    offlineBanner: {
      backgroundColor: colors.warningBg,
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.warningFg,
    },
    offlineText: { fontSize: 12, fontFamily: Fonts.regular, color: colors.warningFg },

    errorBox: {
      margin: 16,
      padding: 12,
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    errorText: { fontSize: 13, fontFamily: Fonts.regular, color: colors.dangerFg },

    loader: { marginTop: 48 },
    list: { padding: 16, gap: 12, paddingBottom: 90 },

    empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
    emptyTitle: { fontSize: 16, fontFamily: Fonts.semiBold, color: colors.textPrimary },
    emptyDesc: { fontSize: 13, fontFamily: Fonts.regular, color: colors.textMuted, textAlign: "center" },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    cardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 8,
    },
    plotName: { flex: 1, fontSize: 15, fontFamily: Fonts.semiBold, color: colors.textPrimary },
    plotDesc: { fontSize: 13, fontFamily: Fonts.regular, color: colors.textMuted },
    cardMeta: { flexDirection: "row", gap: 12, marginTop: 2 },
    metaText: { fontSize: 12, fontFamily: Fonts.regular, color: colors.textMuted },

    badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    badgeSynced: { backgroundColor: colors.successBg },
    badgeSyncedText: { fontSize: 11, fontFamily: Fonts.semiBold, color: colors.successFg },
    badgeDraft: { backgroundColor: colors.warningBg },
    badgeDraftText: { fontSize: 11, fontFamily: Fonts.semiBold, color: colors.warningFg },

    footer: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    captureBtn: {
      backgroundColor: colors.brand,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: "center",
    },
    captureBtnText: { fontSize: 16, fontFamily: Fonts.semiBold, color: colors.brandForeground },
  });
}
