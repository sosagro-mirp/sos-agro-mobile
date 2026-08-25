import { useEffect, useMemo } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, ChevronRight, Circle, Download, Inbox, RefreshCw } from "lucide-react-native";
import { useCachedCampaignsStore } from "../../../src/store/useCachedCampaignsStore";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { runMigrations } from "../../../src/storage/db/db";
import type { CampaignRender } from "../../../src/types";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";
import { AppText } from "../../../src/components/common/AppText";
import { OfflineNotice } from "../../../src/components/common/OfflineNotice";
import { EmptyState } from "../../../src/components/common/EmptyState";
import { SkeletonCard } from "../../../src/components/common/Skeleton";
import { resolveDownloadPhases, type DownloadPhaseRow } from "../../../src/lib/resolveDownloadPhases";

export default function CampaignListScreen() {
  const router = useRouter();
  const {
    campaigns,
    isLoading,
    downloadProgress,
    error,
    loadFromCache,
    refresh,
    isCampaignFullyCached,
  } = useCachedCampaignsStore();
  const { isOnline } = useSyncStatusStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    // On a fresh install this screen can mount before _layout.tsx's own
    // runMigrations() call finishes creating the SQLite tables (e.g. right
    // after login), causing "no such table campaign_cache". runMigrations()
    // is safe to await again here — drizzle's migrate() only executes
    // migrations that haven't already been applied.
    runMigrations()
      .then(loadFromCache)
      .catch(loadFromCache);
  }, []);

  const phases = useMemo(() => resolveDownloadPhases(downloadProgress), [downloadProgress]);
  const refreshDisabled = !isOnline || isLoading;

  return (
    <SafeAreaView style={styles.root} edges={[]}>
      {/* Tab header */}
      <View style={styles.header}>
        <AppText style={styles.title} numberOfLines={1}>
          Campañas
        </AppText>
        <Pressable
          style={[styles.refreshBtn, refreshDisabled && styles.refreshBtnDisabled]}
          onPress={refresh}
          disabled={refreshDisabled}
          accessibilityLabel="Actualizar campañas"
        >
          <RefreshCw size={15} color={refreshDisabled ? colors.textMuted : colors.textPrimary} />
          <AppText
            style={[styles.refreshBtnText, refreshDisabled && styles.refreshBtnTextDisabled]}
            numberOfLines={1}
          >
            Actualizar
          </AppText>
        </Pressable>
      </View>

      {/* Download progress: tres fases, cada una con su propia barra */}
      {downloadProgress ? (
        <View style={styles.progressContainer}>
          {phases.map((phase) => (
            <DownloadPhaseItem key={phase.kind} phase={phase} colors={colors} styles={styles} />
          ))}
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!isOnline && !downloadProgress ? (
        <View style={styles.offlineWrapper}>
          <OfflineNotice message="Sin conexión. Podés trabajar con las campañas ya descargadas; no se pueden traer nuevas." />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading && !downloadProgress}
            onRefresh={refresh}
            tintColor={colors.brand}
          />
        }
      >
        {isLoading && campaigns.length === 0 && !downloadProgress ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Sin campañas descargadas"
            description={
              isOnline
                ? 'Toca "Actualizar" para descargar las campañas activas.'
                : 'Conéctate y toca "Actualizar" para descargar campañas.'
            }
            actionLabel={isOnline ? "Actualizar campañas" : undefined}
            onAction={isOnline ? refresh : undefined}
          />
        ) : (
          campaigns.map((campaign) => (
            <CampaignRow
              key={campaign.campaignId}
              campaign={campaign}
              fullyCached={isCampaignFullyCached(campaign.campaignId)}
              onPress={() => router.push(`/campaign/${campaign.campaignId}/pre-survey`)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DownloadPhaseItem({
  phase,
  colors,
  styles,
}: {
  phase: DownloadPhaseRow;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const iconColor =
    phase.status === "done" ? colors.successFg : phase.status === "current" ? colors.brand : colors.textMuted;
  const barColor = phase.status === "done" ? colors.successFg : colors.brand;

  return (
    <View style={styles.phaseRow}>
      <View style={styles.phaseHeader}>
        {phase.status === "done" ? (
          <Check size={15} color={iconColor} />
        ) : phase.status === "current" ? (
          <Download size={15} color={iconColor} />
        ) : (
          <Circle size={15} color={iconColor} />
        )}
        <Text style={[styles.phaseLabel, phase.status !== "pending" && styles.phaseLabelActive]}>
          {phase.label}
        </Text>
        <Text style={styles.phaseCount}>
          {phase.status === "done" ? "Listo" : `${phase.done}/${phase.total}`}
        </Text>
      </View>
      <View style={styles.phaseTrack}>
        <View style={[styles.phaseFill, { width: `${phase.percent}%`, backgroundColor: barColor }]} />
      </View>
      {phase.status === "current" && phase.currentName ? (
        <Text style={styles.phaseItemName} numberOfLines={1}>
          {phase.currentName}
        </Text>
      ) : null}
    </View>
  );
}

function CampaignRow({
  campaign,
  fullyCached,
  onPress,
}: {
  campaign: CampaignRender;
  fullyCached: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.cardTop}>
        <Text style={styles.campaignName}>{campaign.name}</Text>
        <ChevronRight size={17} color={colors.textMuted} style={styles.cardChevron} />
      </View>

      {campaign.description ? (
        <Text style={styles.campaignDesc} numberOfLines={2}>
          {campaign.description}
        </Text>
      ) : null}

      <View style={styles.cardFooter}>
        <CacheStatusBadge fullyCached={fullyCached} />
        <Text style={styles.cardMeta}>
          {campaign.steps.length} paso{campaign.steps.length !== 1 ? "s" : ""} ·{" "}
          {[...new Set(campaign.steps.map((s) => s.instrument.instrumentId))].length}{" "}
          instrumento
          {[...new Set(campaign.steps.map((s) => s.instrument.instrumentId))].length !== 1
            ? "s"
            : ""}
        </Text>
      </View>
    </Pressable>
  );
}

function CacheStatusBadge({ fullyCached }: { fullyCached: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (fullyCached) {
    return (
      <View style={[styles.badge, styles.badgeCached]}>
        <Check size={11} color={colors.successFg} />
        <Text style={styles.badgeCachedText}>Sin conexión</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgePending]}>
      <Download size={11} color={colors.warningFg} />
      <Text style={styles.badgePendingText}>Descarga pendiente</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 14,
      backgroundColor: colors.surface,
    },
    title: { flexShrink: 1, fontSize: 21, fontFamily: Fonts.extraBold, color: colors.textPrimary },
    // Fixed size: the "Actualizar" button must stay fully visible even when
    // the campaign title is long or the system font scale is high (spec 24).
    refreshBtn: {
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      minHeight: 48,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    refreshBtnDisabled: { borderColor: colors.border },
    refreshBtnText: { fontSize: 14, fontFamily: Fonts.extraBold, color: colors.textPrimary },
    refreshBtnTextDisabled: { color: colors.textMuted },

    progressContainer: {
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    phaseRow: { gap: 6 },
    phaseHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
    phaseLabel: { fontSize: 13, fontFamily: Fonts.medium, color: colors.textMuted, flex: 1 },
    phaseLabelActive: { fontFamily: Fonts.semiBold, color: colors.textPrimary },
    phaseCount: { fontSize: 11, fontFamily: Fonts.regular, color: colors.textMuted },
    phaseTrack: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
    phaseFill: { height: 5, borderRadius: 3 },
    phaseItemName: { fontSize: 10.5, fontFamily: Fonts.regular, color: colors.textMuted },

    offlineWrapper: { padding: 16, paddingBottom: 0 },

    errorBox: {
      margin: 20,
      padding: 14,
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    errorText: { fontSize: 14, fontFamily: Fonts.regular, color: colors.dangerFg },

    list: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, gap: 12 },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    cardPressed: { opacity: 0.8 },
    cardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 8,
      padding: 16,
      paddingBottom: 8,
    },
    cardChevron: { marginTop: 2, flexShrink: 0 },
    campaignName: { flex: 1, fontSize: 17, fontFamily: Fonts.extraBold, color: colors.textPrimary },
    campaignDesc: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    cardFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    // Sin `flex: 1` + `textAlign: "right"`: eso estiraba el texto al borde
    // derecho de la card y dejaba un hueco enorme entre el badge y el texto
    // en vez del gap de 10 px real de `cardFooter` (hallazgo de la ronda
    // manual, spec 74, 2026-08-25). Ahora queda justo después del badge.
    cardMeta: { fontSize: 11.5, fontFamily: Fonts.regular, color: colors.textMuted },

    badge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    badgeCached: { backgroundColor: colors.successBg },
    badgeCachedText: { fontSize: 11, fontFamily: Fonts.extraBold, color: colors.successFg },
    badgePending: { backgroundColor: colors.warningBg },
    badgePendingText: { fontSize: 11, fontFamily: Fonts.extraBold, color: colors.warningFg },
  });
}
