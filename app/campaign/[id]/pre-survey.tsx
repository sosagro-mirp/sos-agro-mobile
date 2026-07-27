import { useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCachedCampaignsStore } from "../../../src/store/useCachedCampaignsStore";
import { useCampaignSessionStore } from "../../../src/store/useCampaignSessionStore";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { createCampaignSession } from "../../../src/api/campaignSessions";
import { useAuthStore } from "../../../src/store/useAuthStore";
import { PreSurveyForm } from "../../../src/components/campaign/PreSurveyForm";
import { OfflineBanner } from "../../../src/components/network/OfflineBanner";
import { Fonts } from "../../../src/theme/fonts";
import { generateLocalId } from "../../../src/lib/generateLocalId";
import { pendingSessionStorage } from "../../../src/storage/pendingSessions";
import { cacheFarmerIdentity } from "../../../src/lib/cacheFarmerIdentity";
import { farmerCacheStorage } from "../../../src/storage/farmerCache";
import { sessionCropsStorage } from "../../../src/storage/sessionCropsStorage";
import { ServerError } from "../../../src/api/httpClient";
import type { CropSummary, FarmerSearchResult } from "../../../src/types";

export default function PreSurveyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const campaign = useCachedCampaignsStore((s) => s.getById(id));
  const {
    startSession,
    applySessionResponse,
    applyOfflineSession,
    setSelectedFarmer,
    setNewFarmerMode,
  } = useCampaignSessionStore();
  const { isOnline } = useSyncStatusStore();
  const { user } = useAuthStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!campaign) {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={styles.errorText}>Campaña no encontrada en caché.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const createOnlineSession = async (
    farmerId: string | undefined,
    crops: CropSummary[] | undefined,
  ) => {
    const cropIds = crops?.map((c) => c.cropId);
    const sessionResponse = await createCampaignSession({
      campaignId: campaign.campaignId,
      userId: user?.userId,
      ...(farmerId ? { farmerId } : {}),
      ...(cropIds && cropIds.length > 0 ? { cropIds } : {}),
    });

    // Known crop for an existing farmer: seed it locally too so offline
    // navigation (getNextStepOffline) can unlock crop-conditioned steps
    // even if the device loses connection later in this same session.
    await sessionCropsStorage.save(sessionResponse.sessionId, crops ?? []);

    applySessionResponse(sessionResponse);
    router.push(`/campaign/${id}/session/${sessionResponse.sessionId}/orchestrator`);
  };

  const startSessionOnline = async (options?: {
    farmerId?: string;
    farmerName?: string;
    isNew?: boolean;
    crops?: CropSummary[];
  }) => {
    setError(null);
    setIsLoading(true);
    startSession(campaign);

    if (options?.isNew) {
      setNewFarmerMode();
    } else if (options?.farmerId && options?.farmerName) {
      setSelectedFarmer(options.farmerId, options.farmerName);
    }

    try {
      await createOnlineSession(options?.farmerId, options?.crops);
    } catch (err) {
      // The farmer was cached on this device (e.g. from a prior test round)
      // but has since been deleted on the backend: invalidate the stale
      // entry and continue the flow as a new farmer instead of leaving the
      // pollster stuck (see spec 49, Bug C).
      if (
        err instanceof ServerError &&
        err.status === 404 &&
        err.message === "Farmer not found" &&
        options?.farmerId
      ) {
        await farmerCacheStorage.remove(options.farmerId);
        setNewFarmerMode();
        try {
          await createOnlineSession(undefined, options.crops);
          setError("El agricultor seleccionado ya no existe en el servidor. Se registró como agricultor nuevo.");
        } catch (retryErr) {
          setError(retryErr instanceof Error ? retryErr.message : "Error al crear la sesión");
        }
      } else {
        setError(err instanceof Error ? err.message : "Error al crear la sesión");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const startSessionOffline = async (options?: {
    farmerId?: string;
    farmerName?: string;
    isNew?: boolean;
    crops?: CropSummary[];
  }) => {
    setError(null);
    setIsLoading(true);

    const localSessionId = generateLocalId('session');
    startSession(campaign);

    if (options?.isNew) {
      setNewFarmerMode();
    } else if (options?.farmerId && options?.farmerName) {
      setSelectedFarmer(options.farmerId, options.farmerName);
    }

    try {
      await pendingSessionStorage.create({
        localSessionId,
        campaignId: campaign.campaignId,
        farmerId: options?.farmerId,
        userId: user?.userId,
      });

      await sessionCropsStorage.save(localSessionId, options?.crops ?? []);

      applyOfflineSession(localSessionId);
      router.push(`/campaign/${id}/session/${localSessionId}/orchestrator`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión offline");
    } finally {
      setIsLoading(false);
    }
  };

  const startSession_ = async (options?: {
    farmerId?: string;
    farmerName?: string;
    isNew?: boolean;
    crops?: CropSummary[];
  }) => {
    if (isOnline) {
      await startSessionOnline(options);
    } else {
      await startSessionOffline(options);
    }
  };

  const handleSearchSelect = async (farmerId: string, farmerName: string, farmer?: FarmerSearchResult) => {
    if (isOnline && farmer) {
      await cacheFarmerIdentity({
        farmerId: farmer.farmerId,
        name: farmer.name,
        documentId: farmer.documentId,
        phone: farmer.phone,
        farmName: farmer.farm?.name,
        crops: farmer.farm?.crops ?? undefined,
      });
    }
    await startSession_({ farmerId, farmerName, crops: farmer?.farm?.crops ?? undefined });
  };

  const handleNewFarmer = async () => {
    await startSession_({ isNew: true });
  };

  return (
    <SafeAreaView style={styles.root}>
      <OfflineBanner />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Campañas</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {campaign.name}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorBoxText}>{error}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Iniciando sesión…</Text>
        </View>
      ) : (
        <PreSurveyForm
          isOnline={isOnline}
          onSearchSelect={handleSearchSelect}
          onNewFarmer={handleNewFarmer}
        />
      )}
    </SafeAreaView>
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
  title: {
    flex: 1,
    fontSize: 17,
    fontFamily: Fonts.bold,
    color: "#111827",
    textAlign: "center",
  },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorBoxText: { fontSize: 14, fontFamily: Fonts.regular, color: "#DC2626" },
  errorText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#DC2626",
    margin: 24,
  },
  loadingOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#6B7280",
  },
});
