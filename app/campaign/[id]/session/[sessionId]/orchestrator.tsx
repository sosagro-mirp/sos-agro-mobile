import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCampaignSessionStore } from "../../../../../src/store/useCampaignSessionStore";
import { useCachedInstrumentsStore } from "../../../../../src/store/useCachedInstrumentsStore";
import { useInstrumentSurveyStore } from "../../../../../src/store/useInstrumentSurveyStore";
import { useSyncStatusStore } from "../../../../../src/store/useSyncStatusStore";
import { getNextStep } from "../../../../../src/api/campaignSessions";
import { fetchInstrumentByCode } from "../../../../../src/api/instruments";
import { extractFarmer, extractCrops } from "../../../../../src/api/farmers";
import { createSurvey } from "../../../../../src/api/surveys";
import { surveyDraftStore } from "../../../../../src/storage/surveyDraftStore";
import { NetworkError } from "../../../../../src/api/httpClient";
import { Fonts } from "../../../../../src/theme/fonts";

type ScreenState = 'loading' | 'offline' | 'injection_error' | 'error';

export default function OrchestratorScreen() {
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId: string }>();
  const router = useRouter();

  const store = useCampaignSessionStore();
  const { downloadAndCache, instruments } = useCachedInstrumentsStore();
  const { initializeSurvey } = useInstrumentSurveyStore();
  const { isOnline } = useSyncStatusStore();

  const resolvedSessionId = sessionId !== "new" ? sessionId : store.sessionId;

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasStarted = useRef(false);

  // ── helpers ────────────────────────────────────────────────────────────────

  const getOrDownloadInstrument = useCallback(async (instrumentId: string) => {
    const cached = instruments.find((i) => i.instrumentId === instrumentId);
    if (cached) return cached;
    return downloadAndCache(instrumentId);
  }, [instruments, downloadAndCache]);

  const injectInstrument = useCallback(async (code: 'S1' | 'S2') => {
    if (!resolvedSessionId) return;

    const { instrumentId, name } = await fetchInstrumentByCode(code);
    const instrument = await getOrDownloadInstrument(instrumentId);

    const { surveyId } = await createSurvey({
      instrumentIds: [instrumentId],
      campaignSessionId: resolvedSessionId,
    });

    await surveyDraftStore.createDraft({
      surveyId,
      instrumentId,
      campaignSessionId: resolvedSessionId,
    });

    if (code === 'S1') {
      store.setInjectionS1SurveyId(surveyId);
    } else {
      store.setInjectionS2SurveyId(surveyId);
    }

    initializeSurvey({
      surveyId,
      instrumentId,
      instrumentName: name,
      sections: instrument.sections,
      campaignSessionId: resolvedSessionId,
    });

    router.replace(`/instrument/${instrumentId}/question/0`);
  }, [resolvedSessionId, getOrDownloadInstrument, store, initializeSurvey, router]);

  // ── main entry logic ───────────────────────────────────────────────────────

  const run = useCallback(async () => {
    if (!resolvedSessionId) return;

    setScreenState('loading');
    setErrorMessage(null);

    try {
      const { injectionPhase, s1SurveyId, s2SurveyId } =
        useCampaignSessionStore.getState();

      if (injectionPhase === 's1') {
        if (!s1SurveyId) {
          // First entry: inject S1
          await injectInstrument('S1');
        } else {
          // Returning from S1: extract farmer then inject S2
          const { farmer } = await extractFarmer(s1SurveyId);
          store.completeS1Injection(farmer.farmerId, farmer.name);
          store.setLastFarmer({
            farmerId: farmer.farmerId,
            name: farmer.name,
            lastName: farmer.lastName,
            ...(farmer.farm ? { farm: { name: farmer.farm.name } } : {}),
          });
          await injectInstrument('S2');
        }
      } else if (injectionPhase === 's2') {
        if (!s2SurveyId) {
          await injectInstrument('S2');
        } else {
          // Returning from S2: extract crops then enter normal flow
          await extractCrops(s2SurveyId);
          store.completeS2Injection();
          // Fall through to getNextStep below
          const nextStep = await getNextStep(resolvedSessionId);
          store.applyNextStep(nextStep);
          if (!nextStep.stepId || !nextStep.instrument) {
            router.replace(`/campaign/${id}/session/${resolvedSessionId}/completed`);
            return;
          }
          router.replace(`/instrument/${nextStep.instrument.instrumentId}/start`);
        }
      } else {
        // Normal flow
        const nextStep = await getNextStep(resolvedSessionId);
        store.applyNextStep(nextStep);
        if (!nextStep.stepId || !nextStep.instrument) {
          router.replace(`/campaign/${id}/session/${resolvedSessionId}/completed`);
          return;
        }
        router.replace(`/instrument/${nextStep.instrument.instrumentId}/start`);
      }
    } catch (err) {
      if (err instanceof NetworkError) {
        setScreenState('offline');
      } else {
        const isInjectionError =
          useCampaignSessionStore.getState().injectionPhase !== 'none';
        setScreenState(isInjectionError ? 'injection_error' : 'error');
        setErrorMessage(err instanceof Error ? err.message : "Error inesperado");
      }
    }
  }, [resolvedSessionId, id, injectInstrument, store, router]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    run();
  }, [run]);

  // Auto-retry when coming back online after an offline failure
  useEffect(() => {
    if (isOnline && screenState === 'offline') {
      hasStarted.current = false;
      run();
    }
  }, [isOnline]);

  const handleSkipInjection = () => {
    store.completeS2Injection(); // resets injectionPhase to 'none'
    hasStarted.current = false;
    run();
  };

  if (screenState === 'offline') {
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
            onPress={() => { hasStarted.current = false; run(); }}
          >
            <Text style={styles.buttonText}>Reintentar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (screenState === 'injection_error') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>⚠️</Text>
          <Text style={styles.title}>Error identificando encuestado</Text>
          <Text style={styles.errorDesc}>{errorMessage}</Text>
          <Pressable
            style={styles.buttonActive}
            onPress={() => { hasStarted.current = false; run(); }}
          >
            <Text style={styles.buttonText}>Reintentar</Text>
          </Pressable>
          <Pressable style={styles.skipButton} onPress={handleSkipInjection}>
            <Text style={styles.skipText}>Continuar sin identificar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (screenState === 'error') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>⚠️</Text>
          <Text style={styles.title}>Error inesperado</Text>
          <Text style={styles.errorDesc}>{errorMessage}</Text>
          <Pressable
            style={styles.buttonActive}
            onPress={() => { hasStarted.current = false; run(); }}
          >
            <Text style={styles.buttonText}>Reintentar</Text>
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
  skipButton: { paddingVertical: 8 },
  skipText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: "#6B7280",
    textDecorationLine: "underline",
  },
});
