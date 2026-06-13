import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCampaignSessionStore } from "../../../../../src/store/useCampaignSessionStore";
import { useSyncStatusStore } from "../../../../../src/store/useSyncStatusStore";
import { getNextStep } from "../../../../../src/api/campaignSessions";
import { NetworkError } from "../../../../../src/api/httpClient";
import { Fonts } from "../../../../../src/theme/fonts";

export default function OrchestratorScreen() {
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId: string }>();
  const router = useRouter();

  const { sessionId: storeSessionId, applyNextStep } = useCampaignSessionStore();
  const { isOnline } = useSyncStatusStore();

  const resolvedSessionId = sessionId !== "new" ? sessionId : storeSessionId;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const fetchNextStep = useCallback(async () => {
    if (!resolvedSessionId) return;

    setIsLoading(true);
    setError(null);
    setIsOffline(false);

    try {
      const nextStep = await getNextStep(resolvedSessionId);
      applyNextStep(nextStep);

      if (!nextStep.stepId || !nextStep.instrument) {
        router.replace(`/campaign/${id}/session/${resolvedSessionId}/completed`);
        return;
      }

      router.replace(`/instrument/${nextStep.instrument.instrumentId}/start`);
    } catch (err) {
      if (err instanceof NetworkError) {
        setIsOffline(true);
      } else {
        setError(err instanceof Error ? err.message : "Error obteniendo el siguiente paso");
      }
    } finally {
      setIsLoading(false);
    }
  }, [resolvedSessionId, id]);

  useEffect(() => {
    fetchNextStep();
  }, [fetchNextStep]);

  // Auto-retry when coming back online after an offline failure
  useEffect(() => {
    if (isOnline && isOffline) {
      fetchNextStep();
    }
  }, [isOnline]);

  if (isOffline) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>📡</Text>
          <Text style={styles.title}>Sin conexión</Text>
          <Text style={styles.desc}>
            Necesitas conexión para continuar al siguiente paso.{"\n"}
            El paso anterior ya fue guardado.
          </Text>
          <Pressable
            style={[styles.button, isOnline && styles.buttonActive]}
            onPress={fetchNextStep}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Reintentar</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>⚠️</Text>
          <Text style={styles.title}>Error inesperado</Text>
          <Text style={styles.errorDesc}>{error}</Text>
          <Pressable
            style={styles.buttonActive}
            onPress={fetchNextStep}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Reintentar</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.loadingLabel}>Cargando siguiente paso…</Text>
      </View>
    </SafeAreaView>
  );
}

const GREEN = "#1B6B3A";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  loadingLabel: { fontSize: 15, fontFamily: Fonts.regular, color: "#6B7280" },
  bigIcon: { fontSize: 48 },
  title: { fontSize: 20, fontFamily: Fonts.bold, color: "#111827" },
  desc: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },
  errorDesc: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#DC2626",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#9CA3AF",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 40,
    marginTop: 8,
  },
  buttonActive: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 40,
    marginTop: 8,
  },
  buttonText: { fontSize: 16, fontFamily: Fonts.semiBold, color: "#fff" },
});
