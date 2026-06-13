import { useEffect } from "react";
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
import { useCachedCampaignsStore } from "../../src/store/useCachedCampaignsStore";
import { useSyncStatusStore } from "../../src/store/useSyncStatusStore";
import type { CampaignRender } from "../../src/types";
import { Fonts } from "../../src/theme/fonts";

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

  useEffect(() => {
    loadFromCache();
  }, []);

  const progressPercent =
    downloadProgress && downloadProgress.total > 0
      ? `${Math.round((downloadProgress.done / downloadProgress.total) * 100)}%`
      : "0%";

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Volver">
          <Text style={styles.back}>← Inicio</Text>
        </Pressable>
        <Text style={styles.title}>Campañas</Text>
        <Pressable
          onPress={refresh}
          disabled={!isOnline || isLoading}
          accessibilityLabel="Actualizar campañas"
        >
          <Text
            style={[styles.refreshBtn, (!isOnline || isLoading) && styles.refreshDisabled]}
          >
            Actualizar
          </Text>
        </Pressable>
      </View>

      {/* Download progress */}
      {downloadProgress ? (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressPhase}>
              {downloadProgress.phase === "campaigns"
                ? "Descargando campañas"
                : "Descargando instrumentos"}
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
              style={[
                styles.progressFill,
                { width: progressPercent as DimensionValue },
              ]}
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
            tintColor={GREEN}
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
            onPress={() =>
              router.push(`/campaign/${campaign.campaignId}/pre-survey`)
            }
          />
        ))}

        {isLoading && campaigns.length === 0 && !downloadProgress ? (
          <ActivityIndicator size="large" color={GREEN} style={styles.loader} />
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
  if (fullyCached) {
    return (
      <View style={[styles.badge, styles.badgeCached]}>
        <Text style={styles.badgeCachedText}>✓ Disponible sin conexión</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgePending]}>
      <Text style={styles.badgePendingText}>Descarga pendiente</Text>
    </View>
  );
}

const GREEN = "#1B6B3A";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  back: { fontSize: 15, fontFamily: Fonts.regular, color: GREEN },
  title: { fontSize: 17, fontFamily: Fonts.bold, color: "#111827" },
  refreshBtn: { fontSize: 15, fontFamily: Fonts.semiBold, color: GREEN },
  refreshDisabled: { color: "#9CA3AF" },

  // Progress
  progressContainer: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 6,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressPhase: { fontSize: 13, fontFamily: Fonts.semiBold, color: "#374151" },
  progressCount: { fontSize: 13, fontFamily: Fonts.regular, color: "#6B7280" },
  progressName: { fontSize: 12, fontFamily: Fonts.regular, color: "#9CA3AF" },
  progressTrack: {
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    backgroundColor: GREEN,
    borderRadius: 3,
  },

  // Offline banner
  offlineBanner: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
  },
  offlineText: { fontSize: 13, fontFamily: Fonts.regular, color: "#92400E" },

  // Error
  errorBox: {
    margin: 20,
    padding: 14,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { fontSize: 14, fontFamily: Fonts.regular, color: "#DC2626" },

  // List
  list: { padding: 20, gap: 12 },
  loader: { marginTop: 48 },

  // Campaign card
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  cardPressed: { opacity: 0.8 },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  campaignName: {
    flex: 1,
    fontSize: 17,
    fontFamily: Fonts.semiBold,
    color: "#111827",
  },
  campaignDesc: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#6B7280",
  },
  cardBottom: {
    flexDirection: "row",
    gap: 16,
  },
  stepsCount: { fontSize: 12, fontFamily: Fonts.regular, color: GREEN },
  instrumentsCount: { fontSize: 12, fontFamily: Fonts.regular, color: "#6B7280" },

  // Cache status badge
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeCached: { backgroundColor: "#DCFCE7" },
  badgeCachedText: { fontSize: 11, fontFamily: Fonts.semiBold, color: GREEN },
  badgePending: { backgroundColor: "#FEF3C7" },
  badgePendingText: { fontSize: 11, fontFamily: Fonts.semiBold, color: "#92400E" },

  // Empty state
  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 17, fontFamily: Fonts.semiBold, color: "#374151" },
  emptyDesc: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9CA3AF",
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
