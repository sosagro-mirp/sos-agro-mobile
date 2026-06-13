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
import type { PreSurveyFormData } from "../../../src/types";
import { Fonts } from "../../../src/theme/fonts";

export default function PreSurveyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const campaign = useCachedCampaignsStore((s) => s.getById(id));
  const { startSession, setPreSurveyData, applySessionResponse } = useCampaignSessionStore();
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

  const handleSubmit = async (data: PreSurveyFormData) => {
    if (!isOnline) {
      setError("Necesitas conexión para iniciar una visita.");
      return;
    }

    setError(null);
    setIsLoading(true);
    startSession(campaign);
    setPreSurveyData(data);

    try {
      const sessionResponse = await createCampaignSession({
        campaignId: campaign.campaignId,
        userId: user?.userId,
        farmerId: data.selectedFarmerId ?? undefined,
        cropIds: data.cropIds.length > 0 ? data.cropIds : undefined,
      });

      applySessionResponse(sessionResponse);

      router.push(
        `/campaign/${id}/session/${sessionResponse.sessionId}/orchestrator`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al crear la sesión"
      );
    } finally {
      setIsLoading(false);
    }
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

      <PreSurveyForm onSubmit={handleSubmit} isLoading={isLoading} />
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
  title: { flex: 1, fontSize: 17, fontFamily: Fonts.bold, color: "#111827", textAlign: "center" },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorBoxText: { fontSize: 14, fontFamily: Fonts.regular, color: "#DC2626" },
  errorText: { fontSize: 16, fontFamily: Fonts.regular, color: "#DC2626", margin: 24 },
});
