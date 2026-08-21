import { useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCachedCampaignsStore } from "../../../src/store/useCachedCampaignsStore";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { runMigrations } from "../../../src/storage/db/db";
import type { CampaignRender } from "../../../src/types";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";
import { AppText } from "../../../src/components/common/AppText";

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

  const progressPercent =
    downloadProgress && downloadProgress.total > 0
      ? `${Math.round((downloadProgress.done / downloadProgress.total) * 100)}%`
      : "0%";

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      {/* Tab header */}
      <View style={styles.header}>
        <AppText style={styles.title} numberOfLines={1}>
          Campañas
        </AppText>
        <Pressable
          style={styles.refreshBtnWrapper}
          onPress={refresh}
          disabled={!isOnline || isLoading}
          accessibilityLabel="Actualizar campañas"
        >
          <AppText
            style={[styles.refreshBtn, (!isOnline || isLoading) && styles.refreshDisabled]}
            numberOfLines={1}
          >
            Actualizar
          </AppText>
        </Pressable>
      </View>

      {/* Download progress */}
      {downloadProgress ? (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressPhase}>
              {downloadProgress.phase === "campaigns"
                ? "Descargando campañas"
                : downloadProgress.phase === "instruments"
                ? "Descargando instrumentos"
                : "Guardando encuestados"}
            </Text>
            <Text style={styles.progressCount}>
              {downloadProgress.done}/{downloadProgress.total}
            </Text>
          </View>
          <Text style={styles.progressName} numberOfLines={1}>
            {downloadProgress.currentName}
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: progressPercent as DimensionValue }]}
            />
          </View>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!isOnline && !downloadProgress ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            Sin conexión — mostrando campañas guardadas localmente
          </Text>
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
        {campaigns.length === 0 && !isLoading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Sin campañas descargadas</Text>
            <Text style={styles.emptyDesc}>
              {isOnline
                ? 'Toca "Actualizar" para descargar las campañas activas.'
                : 'Conéctate y toca "Actualizar" para descargar campañas.'}
            </Text>
          </View>
        ) : null}

        {campaigns.map((campaign) => (
          <CampaignRow
            key={campaign.campaignId}
            campaign={campaign}
            fullyCached={isCampaignFullyCached(campaign.campaignId)}
            onPress={() => router.push(`/campaign/${campaign.campaignId}/pre-survey`)}
          />
        ))}

        {isLoading && campaigns.length === 0 && !downloadProgress ? (
          <ActivityIndicator size="large" color={colors.brand} style={styles.loader} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
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
        <CacheStatusBadge fullyCached={fullyCached} />
      </View>

      {campaign.description ? (
        <Text style={styles.campaignDesc} numberOfLines={2}>
          {campaign.description}
        </Text>
      ) : null}

      <View style={styles.cardBottom}>
        <Text style={styles.stepsCount}>
          {campaign.steps.length} paso{campaign.steps.length !== 1 ? "s" : ""}
        </Text>
        <Text style={styles.instrumentsCount}>
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
        <Text style={styles.badgeCachedText}>✓ Sin conexión</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgePending]}>
      <Text style={styles.badgePendingText}>Descarga pendiente</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: { flexShrink: 1, fontSize: 17, fontFamily: Fonts.bold, color: colors.textPrimary },
    // Fixed size: the "Actualizar" button must stay fully visible even when
    // the campaign title is long or the system font scale is high (spec 24).
    refreshBtnWrapper: { flexShrink: 0 },
    refreshBtn: { fontSize: 15, fontFamily: Fonts.semiBold, color: colors.brand },
    refreshDisabled: { color: colors.textMuted },

    progressContainer: {
      backgroundColor: colors.surface,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 6,
    },
    progressHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    progressPhase: { fontSize: 13, fontFamily: Fonts.semiBold, color: colors.textPrimary },
    progressCount: { fontSize: 13, fontFamily: Fonts.regular, color: colors.textMuted },
    progressName: { fontSize: 12, fontFamily: Fonts.regular, color: colors.textMuted },
    progressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
    progressFill: { height: 6, backgroundColor: colors.brand, borderRadius: 3 },

    offlineBanner: {
      backgroundColor: colors.warningBg,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.warningFg,
    },
    offlineText: { fontSize: 13, fontFamily: Fonts.regular, color: colors.warningFg },

    errorBox: {
      margin: 20,
      padding: 14,
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    errorText: { fontSize: 14, fontFamily: Fonts.regular, color: colors.dangerFg },

    list: { padding: 20, gap: 12 },
    loader: { marginTop: 48 },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    cardPressed: { opacity: 0.8 },
    cardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 8,
    },
    campaignName: { flex: 1, fontSize: 17, fontFamily: Fonts.semiBold, color: colors.textPrimary },
    campaignDesc: { fontSize: 14, fontFamily: Fonts.regular, color: colors.textMuted },
    cardBottom: { flexDirection: "row", gap: 16 },
    stepsCount: { fontSize: 12, fontFamily: Fonts.regular, color: colors.brand },
    instrumentsCount: { fontSize: 12, fontFamily: Fonts.regular, color: colors.textMuted },

    badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    badgeCached: { backgroundColor: colors.successBg },
    badgeCachedText: { fontSize: 11, fontFamily: Fonts.semiBold, color: colors.successFg },
    badgePending: { backgroundColor: colors.warningBg },
    badgePendingText: { fontSize: 11, fontFamily: Fonts.semiBold, color: colors.warningFg },

    empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
    emptyTitle: { fontSize: 17, fontFamily: Fonts.semiBold, color: colors.textPrimary },
    emptyDesc: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      textAlign: "center",
      paddingHorizontal: 32,
    },
  });
}
