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
import { overwriteSurvey, skipStepApi } from "../../../../../src/api/surveys";
import { surveyDraftStore } from "../../../../../src/storage/surveyDraftStore";
import { syncQueueStorage } from "../../../../../src/storage/syncQueue";
import { instrumentCacheStorage } from "../../../../../src/storage/instrumentCache";
import { farmerCacheStorage } from "../../../../../src/storage/farmerCache";
import { SyncQueueService } from "../../../../../src/sync/SyncQueueService";
import { checkDuplicate } from "../../../../../src/storage/duplicateDetection";
import { getNextStepOffline } from "../../../../../src/lib/getNextStepOffline";
import { extractCropsOffline } from "../../../../../src/lib/extractCropsOffline";
import { generateLocalId } from "../../../../../src/lib/generateLocalId";
import { extractFarmerLocally } from "../../../../../src/lib/extractFarmerLocally";
import { sessionCropsStorage } from "../../../../../src/storage/sessionCropsStorage";
import { DuplicateAlertModal } from "../../../../../src/components/campaign/DuplicateAlertModal";
import { NetworkError } from "../../../../../src/api/httpClient";
import { Fonts } from "../../../../../src/theme/fonts";

type ScreenState = 'loading' | 'offline' | 'injection_error' | 'error' | 'duplicate_pending' | 'offline_extraction_pending';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

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
  const [duplicatePending, setDuplicatePending] = useState<{
    instrument: { instrumentId: string; name: string };
    stepOrder: number;
    localSurveyId?: string;
    remoteSurveyId?: string;
  } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const hasStarted = useRef(false);

  // ── helpers ────────────────────────────────────────────────────────────────

  const getOrDownloadInstrument = useCallback(async (instrumentId: string) => {
    const cached = instruments.find((i) => i.instrumentId === instrumentId);
    if (cached) return cached;
    return downloadAndCache(instrumentId);
  }, [instruments, downloadAndCache]);

  const injectInstrumentOnline = useCallback(async (code: 'S1' | 'S2') => {
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

  const injectInstrumentOffline = useCallback(async (code: 'S1' | 'S2') => {
    if (!resolvedSessionId) return;

    const allInstruments = await instrumentCacheStorage.list();
    const instrument = allInstruments.find((i) => i.code === code);

    if (!instrument) {
      setScreenState('injection_error');
      setErrorMessage('Instrumento no disponible offline. Descarga las campañas con WiFi.');
      return;
    }

    const localSurveyId = generateLocalId('survey');

    await surveyDraftStore.createDraft({
      surveyId: localSurveyId,
      instrumentId: instrument.instrumentId,
      campaignSessionId: resolvedSessionId,
    });

    // NO enqueue here — enqueueSubmission() handles this when the user completes the survey,
    // same as the online flow (injectInstrumentOnline never enqueues at injection time either).

    if (code === 'S1') {
      store.setInjectionS1SurveyId(localSurveyId);
    } else {
      store.setInjectionS2SurveyId(localSurveyId);
    }

    initializeSurvey({
      surveyId: localSurveyId,
      instrumentId: instrument.instrumentId,
      instrumentName: instrument.name,
      sections: instrument.sections,
      campaignSessionId: resolvedSessionId,
    });

    router.replace(`/instrument/${instrument.instrumentId}/question/0`);
  }, [resolvedSessionId, store, initializeSurvey, router]);

  const injectInstrument = useCallback(async (code: 'S1' | 'S2') => {
    if (isOnline) {
      await injectInstrumentOnline(code);
    } else {
      await injectInstrumentOffline(code);
    }
  }, [isOnline, injectInstrumentOnline, injectInstrumentOffline]);

  // Offline-only duplicate check: preserves the original navigation logic (instrument! is safe
  // because callers already guard against missing instrument) while adding duplicate detection.
  const checkDuplicateAndNavigateOffline = useCallback(async (nextStep: {
    stepId?: string;
    order?: number;
    instrument?: { instrumentId: string; name: string; isActive: boolean };
  }) => {
    if (!nextStep.instrument) {
      router.replace(`/campaign/${id}/session/${resolvedSessionId}/completed`);
      return;
    }

    const { farmerId, campaign } = useCampaignSessionStore.getState();

    if (farmerId && campaign?.campaignId) {
      const duplicateResult = await checkDuplicate({
        farmerId,
        instrumentId: nextStep.instrument.instrumentId,
        campaignId: campaign.campaignId,
        isOnline: false,
      });

      if (duplicateResult.hasDuplicate) {
        setDuplicatePending({
          instrument: nextStep.instrument,
          stepOrder: nextStep.order ?? 0,
          localSurveyId: duplicateResult.localSurveyId,
          remoteSurveyId: undefined,
        });
        setScreenState('duplicate_pending');
        return;
      }
    }

    await getOrDownloadInstrument(nextStep.instrument.instrumentId);
    router.replace(`/instrument/${nextStep.instrument.instrumentId}/start`);
  }, [id, resolvedSessionId, getOrDownloadInstrument, router]);

  // Check for duplicates and either navigate or set duplicate_pending state.
  const checkAndNavigate = useCallback(async (nextStep: {
    stepId?: string;
    order?: number;
    instrument?: { instrumentId: string; name: string; isActive: boolean };
  }) => {
    if (!nextStep.stepId || !nextStep.instrument) {
      router.replace(`/campaign/${id}/session/${resolvedSessionId}/completed`);
      return;
    }

    const { farmerId, campaign } = useCampaignSessionStore.getState();

    if (farmerId && campaign?.campaignId) {
      const duplicateResult = await checkDuplicate({
        farmerId,
        instrumentId: nextStep.instrument.instrumentId,
        campaignId: campaign.campaignId,
        isOnline,
      });

      if (duplicateResult.hasDuplicate) {
        setDuplicatePending({
          instrument: nextStep.instrument,
          stepOrder: nextStep.order ?? 0,
          localSurveyId: duplicateResult.localSurveyId,
          remoteSurveyId: isOnline ? duplicateResult.localSurveyId : undefined,
        });
        setScreenState('duplicate_pending');
        return;
      }
    }

    await getOrDownloadInstrument(nextStep.instrument.instrumentId);
    router.replace(`/instrument/${nextStep.instrument.instrumentId}/start`);
  }, [id, resolvedSessionId, isOnline, getOrDownloadInstrument, router]);

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
          await injectInstrument('S1');
        } else if (isOnline) {
          // Online: sync S1, extract farmer, inject S2
          await SyncQueueService.processSurveyNow(s1SurveyId);
          const { farmer } = await extractFarmer(s1SurveyId);
          store.completeS1Injection(farmer.farmerId, farmer.name);
          store.setLastFarmer({
            farmerId: farmer.farmerId,
            name: farmer.name,
            lastName: farmer.lastName,
            ...(farmer.farm ? { farm: { name: farmer.farm.name } } : {}),
          });
          await injectInstrument('S2');
        } else {
          // Offline: extract farmer locally from S1 responses
          const draft = await extractFarmerLocally(s1SurveyId);
          if (draft) {
            if (draft.isProvisional) {
              await farmerCacheStorage.upsert({
                farmerId: draft.farmerId,
                name: draft.name,
                lastName: draft.lastName ?? undefined,
                documentId: draft.documentId ?? undefined,
                phone: draft.phone ?? undefined,
                cachedAt: new Date(),
              });
            }
            store.applyLocalFarmer(draft);
            store.completeS1Injection(draft.farmerId, draft.name);
            await injectInstrument('S2');
          } else {
            setScreenState('offline_extraction_pending');
          }
        }
      } else if (injectionPhase === 's2') {
        if (!s2SurveyId) {
          await injectInstrument('S2');
        } else if (isOnline) {
          // Online: sync S2, extract crops, get next step
          await SyncQueueService.processSurveyNow(s2SurveyId);
          const cropsResult = await extractCrops(s2SurveyId);
          if (resolvedSessionId) {
            await sessionCropsStorage.save(resolvedSessionId, cropsResult.crops);
          }
          store.completeS2Injection();
          const nextStep = await getNextStep(resolvedSessionId);
          store.applyNextStep(nextStep);
          await checkAndNavigate(nextStep);
        } else {
          // Offline: extract crops locally from cached S2 responses, then continue
          const { campaign } = useCampaignSessionStore.getState();
          if (s2SurveyId && campaign?.campaignId && resolvedSessionId) {
            const offlineCrops = await extractCropsOffline(s2SurveyId, campaign.campaignId);
            if (offlineCrops.length > 0) {
              await sessionCropsStorage.save(resolvedSessionId, offlineCrops);
            }
          }
          store.completeS2Injection();
          if (!campaign?.campaignId) {
            router.replace(`/campaign/${id}/session/${resolvedSessionId}/completed`);
            return;
          }
          const nextStep = await getNextStepOffline(campaign.campaignId, resolvedSessionId, -1);
          if (!nextStep || (!nextStep.stepId && !nextStep.instrument)) {
            router.replace(`/campaign/${id}/session/${resolvedSessionId}/completed`);
            return;
          }
          store.applyNextStep(nextStep);
          await checkDuplicateAndNavigateOffline(nextStep);
        }
      } else {
        if (isOnline) {
          const nextStep = await getNextStep(resolvedSessionId);
          store.applyNextStep(nextStep);
          await checkAndNavigate(nextStep);
        } else {
          const { campaign, currentStep } = useCampaignSessionStore.getState();
          if (!campaign?.campaignId) {
            setScreenState('offline');
            return;
          }
          const lastOrder = currentStep?.order ?? -1;
          const nextStep = await getNextStepOffline(campaign.campaignId, resolvedSessionId, lastOrder);
          if (!nextStep || (!nextStep.stepId && !nextStep.instrument)) {
            router.replace(`/campaign/${id}/session/${resolvedSessionId}/completed`);
            return;
          }
          store.applyNextStep(nextStep);
          await checkDuplicateAndNavigateOffline(nextStep);
        }
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
  }, [resolvedSessionId, id, injectInstrument, store, checkAndNavigate, checkDuplicateAndNavigateOffline, isOnline, getOrDownloadInstrument, router]);

  // ── duplicate handlers ─────────────────────────────────────────────────────

  const handleOverwrite = useCallback(async () => {
    if (!duplicatePending || !resolvedSessionId) return;
    setModalLoading(true);

    try {
      if (isOnline) {
        const { sessionId: storeSessionId } = useCampaignSessionStore.getState();
        const { surveyId: newSurveyId } = await overwriteSurvey({
          surveyId: duplicatePending.remoteSurveyId!,
          sessionId: storeSessionId!,
          instrumentId: duplicatePending.instrument.instrumentId,
          stepOrder: duplicatePending.stepOrder,
        });

        await getOrDownloadInstrument(duplicatePending.instrument.instrumentId);
        setDuplicatePending(null);
        setScreenState('loading');
        router.replace(
          `/instrument/${duplicatePending.instrument.instrumentId}/start?existingSurveyId=${newSurveyId}`
        );
      } else {
        if (duplicatePending.localSurveyId) {
          await syncQueueStorage.deleteBySurveyId(duplicatePending.localSurveyId);
          await surveyDraftStore.deleteDraft(duplicatePending.localSurveyId);
        }
        await getOrDownloadInstrument(duplicatePending.instrument.instrumentId);
        setDuplicatePending(null);
        setScreenState('loading');
        router.replace(`/instrument/${duplicatePending.instrument.instrumentId}/start`);
      }
    } catch (err) {
      setModalLoading(false);
      setScreenState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Error al sobrescribir');
    }
  }, [duplicatePending, resolvedSessionId, isOnline, getOrDownloadInstrument, router]);

  const handleSkip = useCallback(async () => {
    if (!duplicatePending || !resolvedSessionId) return;
    setModalLoading(true);

    try {
      const { sessionId: storeSessionId, campaign } = useCampaignSessionStore.getState();

      if (isOnline) {
        await skipStepApi({
          sessionId: storeSessionId!,
          instrumentId: duplicatePending.instrument.instrumentId,
          stepOrder: duplicatePending.stepOrder,
        });

        setDuplicatePending(null);
        setModalLoading(false);
        hasStarted.current = false;
        run();
      } else {
        const skipSurveyId = generateId();
        await surveyDraftStore.createDraft({
          surveyId: skipSurveyId,
          instrumentId: duplicatePending.instrument.instrumentId,
          campaignSessionId: storeSessionId ?? undefined,
        });
        await surveyDraftStore.markCompleted(skipSurveyId);
        await syncQueueStorage.enqueue({
          id: generateId(),
          surveyId: skipSurveyId,
          campaignSessionId: storeSessionId ?? undefined,
          stepOrder: duplicatePending.stepOrder,
        });

        setDuplicatePending(null);
        setModalLoading(false);

        const campaignId = campaign?.campaignId;
        if (!campaignId) {
          router.replace(`/campaign/${id}/session/${resolvedSessionId}/completed`);
          return;
        }

        const nextStepOffline = await getNextStepOffline(
          campaignId,
          resolvedSessionId,
          duplicatePending.stepOrder,
        );

        if (!nextStepOffline || (!nextStepOffline.stepId && !nextStepOffline.instrument)) {
          router.replace(`/campaign/${id}/session/${resolvedSessionId}/completed`);
          return;
        }

        store.applyNextStep(nextStepOffline);
        await getOrDownloadInstrument(nextStepOffline.instrument!.instrumentId);
        router.replace(`/instrument/${nextStepOffline.instrument!.instrumentId}/start`);
      }
    } catch (err) {
      setModalLoading(false);
      setScreenState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Error al saltar paso');
    }
  }, [duplicatePending, resolvedSessionId, isOnline, id, store, getOrDownloadInstrument, router, run]);

  const handleCancel = useCallback(() => {
    setDuplicatePending(null);
    router.replace(`/campaign/${id}/pre-survey`);
  }, [id, router]);

  // ── effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    run();
  }, [run]);

  // Auto-retry when coming back online after an offline failure.
  // Skip if the duplicate modal is open — user is in a decision flow.
  useEffect(() => {
    if (isOnline && screenState === 'offline') {
      hasStarted.current = false;
      run();
    }
  }, [isOnline]);

  // ── render ─────────────────────────────────────────────────────────────────

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

  if (screenState === 'offline_extraction_pending') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>⚠️</Text>
          <Text style={styles.title}>No se pudo identificar al encuestado</Text>
          <Text style={styles.desc}>
            No se pudo leer los datos del encuestado.{"\n"}
            Conéctate para continuar o continúa sin identificar.
          </Text>
          <Pressable
            style={styles.buttonActive}
            onPress={() => { hasStarted.current = false; run(); }}
          >
            <Text style={styles.buttonText}>Reintentar</Text>
          </Pressable>
          <Pressable
            style={styles.button}
            onPress={() => {
              store.completeS2Injection();
              hasStarted.current = false;
              run();
            }}
          >
            <Text style={styles.buttonText}>Continuar sin identificar</Text>
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
          <Text style={styles.desc}>
            Debes identificar al encuestado antes de continuar.{"\n"}
            Vuelve y regístralo si aún no existe en el sistema.
          </Text>
          <Pressable
            style={styles.buttonActive}
            onPress={() => { hasStarted.current = false; run(); }}
          >
            <Text style={styles.buttonText}>Reintentar</Text>
          </Pressable>
          <Pressable
            style={styles.button}
            onPress={() => router.replace(`/campaign/${id}/pre-survey`)}
          >
            <Text style={styles.buttonText}>← Volver a identificar</Text>
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
      <DuplicateAlertModal
        visible={screenState === 'duplicate_pending'}
        instrumentName={duplicatePending?.instrument.name ?? ''}
        isLoading={modalLoading}
        onOverwrite={handleOverwrite}
        onSkip={handleSkip}
        onCancel={handleCancel}
      />
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
