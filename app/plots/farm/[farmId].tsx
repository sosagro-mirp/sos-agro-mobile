import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Plus, RefreshCw, WifiOff } from "lucide-react-native";
import { farmPlotStore, type FarmPlotDraft } from "../../../src/storage/farmPlotStore";
import { getFarmPlotsByFarm, type FarmPlotResponse } from "../../../src/api/farmPlots";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { StatusBadge } from "../../../src/components/common/StatusBadge";
import { AppText } from "../../../src/components/common/AppText";
import { PlotSketch } from "../../../src/components/plots/PlotSketch";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";

export default function FarmPlotsScreen() {
  const { farmId, farmName, farmerName } = useLocalSearchParams<{
    farmId: string;
    farmName?: string;
    farmerName?: string;
  }>();
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
      // Carga desde SQLite primero — funciona sin conexión.
      const local = await farmPlotStore.loadDraftsByFarm(farmId);
      setPlots(local);

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
            status: "synced",
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
        <TouchableOpacity onPress={() => router.back()} style={styles.headerSlot} accessibilityRole="button" accessibilityLabel="Volver">
          <ChevronLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppText style={styles.title} numberOfLines={1}>
            {farmName ?? "Lotes de la finca"}
          </AppText>
          {farmerName ? (
            <Text style={styles.subtitle} numberOfLines={1}>{farmerName}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={load}
          disabled={!isOnline || isLoading}
          style={styles.headerSlot}
          accessibilityRole="button"
          accessibilityLabel="Actualizar lotes"
        >
          <RefreshCw size={18} color={!isOnline || isLoading ? colors.textMuted : colors.brand} />
        </TouchableOpacity>
      </View>

      {!isOnline ? (
        <View style={styles.offlineBanner}>
          <WifiOff size={14} color={colors.warningFg} strokeWidth={2.4} />
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
          <Plus size={18} color={colors.brandForeground} strokeWidth={2.6} />
          <Text style={styles.captureBtnText}>Capturar nuevo lote</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function PlotRow({ plot }: { plot: FarmPlotDraft }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pointCount = plot.polygon.points.length;
  const isSynced = plot.status === "synced";

  return (
    <View style={styles.card}>
      <View style={styles.sketchWrap}>
        <PlotSketch points={plot.polygon.points} size="thumbnail" />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.plotName} numberOfLines={1}>{plot.name}</Text>
          <StatusBadge
            kind={isSynced ? "synced" : "pending"}
            label={isSynced ? "Sincronizado" : "Borrador"}
          />
        </View>
        {plot.description ? (
          <Text style={styles.plotDesc} numberOfLines={1}>{plot.description}</Text>
        ) : null}
        <View style={styles.cardMeta}>
          <Text style={styles.metaText}>{pointCount} punto{pointCount !== 1 ? "s" : ""}</Text>
          {plot.area ? <Text style={styles.metaText}>{plot.area.toFixed(2)} ha</Text> : null}
          <Text style={styles.metaText}>{plot.createdAt.toLocaleDateString("es-CO")}</Text>
        </View>
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
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 11,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerSlot: { width: 40, height: 40, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    headerCenter: { flex: 1, alignItems: "center" },
    title: { fontSize: 15, fontFamily: Fonts.extraBold, color: colors.textPrimary, textAlign: "center" },
    subtitle: { fontSize: 11.5, fontFamily: Fonts.regular, color: colors.textMuted, textAlign: "center", marginTop: 1 },

    offlineBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      justifyContent: "center",
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
      flexDirection: "row",
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sketchWrap: {
      width: 56,
      height: 56,
      borderRadius: 8,
      overflow: "hidden",
      backgroundColor: colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    cardBody: { flex: 1, gap: 5 },
    cardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 8,
    },
    plotName: { flex: 1, fontSize: 14.5, fontFamily: Fonts.bold, color: colors.textPrimary },
    plotDesc: { fontSize: 12.5, fontFamily: Fonts.regular, color: colors.textMuted },
    cardMeta: { flexDirection: "row", gap: 12, marginTop: 2 },
    metaText: { fontSize: 11.5, fontFamily: Fonts.regular, color: colors.textMuted },

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
      flexDirection: "row",
      gap: 8,
      backgroundColor: colors.brand,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    captureBtnText: { fontSize: 15, fontFamily: Fonts.extraBold, color: colors.brandForeground },
  });
}
