import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { WifiOff, TriangleAlert, RefreshCw, ChevronLeft, LoaderCircle, type LucideIcon } from "lucide-react-native";
import { useCampaignSessionStore } from "../../../../../src/store/useCampaignSessionStore";
import { useCachedInstrumentsStore } from "../../../../../src/store/useCachedInstrumentsStore";
import { useInstrumentSurveyStore } from "../../../../../src/store/useInstrumentSurveyStore";
import { useSyncStatusStore } from "../../../../../src/store/useSyncStatusStore";
import { getNextStep } from "../../../../../src/api/campaignSessions";
import { fetchInstrumentByCode } from "../../../../../src/api/instruments";
import { extractFarmer, extractCrops, DocumentIdCollisionError } from "../../../../../src/api/farmers";
import { overwriteSurvey, skipStepApi } from "../../../../../src/api/surveys";
import { surveyDraftStore } from "../../../../../src/storage/surveyDraftStore";
import { syncQueueStorage } from "../../../../../src/storage/syncQueue";
import { instrumentCacheStorage } from "../../../../../src/storage/instrumentCache";
import { SyncQueueService } from "../../../../../src/sync/SyncQueueService";
import { checkDuplicate } from "../../../../../src/storage/duplicateDetection";
import { getNextStepOffline } from "../../../../../src/lib/getNextStepOffline";
import { extractCropsOffline } from "../../../../../src/lib/extractCropsOffline";
import { generateLocalId } from "../../../../../src/lib/generateLocalId";
import { extractFarmerLocally } from "../../../../../src/lib/extractFarmerLocally";
import type { LocalFarmerDraft } from "../../../../../src/lib/extractFarmerLocally";
import { flattenSections } from "../../../../../src/lib/flattenSections";
import { cacheFarmerIdentity } from "../../../../../src/lib/cacheFarmerIdentity";
import { resolveLegacyInstrumentCode } from "../../../../../src/lib/instrumentCodeAliases";
import { applyPendingConsentToFarmer } from "../../../../../src/lib/applyPendingConsentToFarmer";
import { sessionCropsStorage } from "../../../../../src/storage/sessionCropsStorage";
import { DuplicateAlertModal } from "../../../../../src/components/campaign/DuplicateAlertModal";
import { DocumentCollisionModal } from "../../../../../src/components/campaign/DocumentCollisionModal";
import { NetworkError } from "../../../../../src/api/httpClient";
import { advanceWithinCampaign, returnToPreSurvey } from "../../../../../src/lib/campaignNavigation";
import { Fonts } from "../../../../../src/theme/fonts";
import { useTheme } from "../../../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../../../src/theme/colors";

type ScreenState = 'loading' | 'offline' | 'injection_error' | 'error' | 'duplicate_pending' | 'offline_extraction_pending' | 'document_collision_pending';

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
  // Spec 68 — colisión de documentId detectada al identificar (S1a): el
  // documento coincide con un agricultor existente cuyo nombre no
  // corresponde. `localDraft` solo se llena en el camino offline (Fase 4) —
  // es la identidad provisional que ya generó `extractFarmerLocally()` y
  // que "Registrar aparte" simplemente confirma, sin red.
  const [documentCollisionPending, setDocumentCollisionPending] = useState<{
    documentId: string;
    submittedName: string;
    existingFarmerName: string;
    offline: boolean;
    localDraft?: LocalFarmerDraft;
  } | null>(null);
  const hasStarted = useRef(false);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

    // Spec 70, Fase 4 (vector 3) — igual que `injectInstrumentOffline`: el
    // registro real se difiere hasta que exista contenido. Antes, esto
    // llamaba a `createSurvey()` de inmediato; si la app se cerraba durante
    // la fase de inyección, `s1SurveyId`/`s2SurveyId` (solo en memoria) se
    // perdía y la reentrada creaba una fila nueva, dejando la anterior
    // huérfana.
    const surveyId = generateLocalId('survey');

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

    advanceWithinCampaign(router, id, `/instrument/${instrumentId}/question/0`);
  }, [resolvedSessionId, getOrDownloadInstrument, store, initializeSurvey, router, id]);

  const injectInstrumentOffline = useCallback(async (code: 'S1' | 'S2') => {
    if (!resolvedSessionId) return;

    const allInstruments = await instrumentCacheStorage.list();
    const instrument = allInstruments.find((i) => resolveLegacyInstrumentCode(i.code) === code);

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

    advanceWithinCampaign(router, id, `/instrument/${instrument.instrumentId}/question/0`);
  }, [resolvedSessionId, store, initializeSurvey, router, id]);

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
      advanceWithinCampaign(router, id, `/campaign/${id}/session/${resolvedSessionId}/completed`);
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
    advanceWithinCampaign(router, id, `/instrument/${nextStep.instrument.instrumentId}/start`);
  }, [id, resolvedSessionId, getOrDownloadInstrument, router]);

  // Check for duplicates and either navigate or set duplicate_pending state.
  const checkAndNavigate = useCallback(async (nextStep: {
    stepId?: string;
    order?: number;
    instrument?: { instrumentId: string; name: string; isActive: boolean };
  }) => {
    if (!nextStep.stepId || !nextStep.instrument) {
      advanceWithinCampaign(router, id, `/campaign/${id}/session/${resolvedSessionId}/completed`);
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
    advanceWithinCampaign(router, id, `/instrument/${nextStep.instrument.instrumentId}/start`);
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
          // Online: sync S1, extract farmer, inject S2.
          // `s1SurveyId` is local (spec 70, Fase 4) — processSurveyNow()
          // materializes it on the backend; extractFarmer() needs the real id.
          await SyncQueueService.processSurveyNow(s1SurveyId);
          const realS1SurveyId = await surveyDraftStore.getBackendSurveyId(s1SurveyId);
          if (!realS1SurveyId) {
            // Sync didn't materialize it (e.g. S1 has no answers yet) —
            // sending the local id to extractFarmer() would 404 against the
            // backend. Surface it as an injection error instead of a silent
            // fallback (caught below, sets screenState to 'injection_error').
            throw new Error(
              `No se pudo sincronizar la encuesta S1 (${s1SurveyId}) antes de extraer el agricultor`,
            );
          }
          try {
            const { farmer } = await extractFarmer(realS1SurveyId);
            await cacheFarmerIdentity({
              farmerId: farmer.farmerId,
              name: farmer.name,
              documentId: farmer.documentId,
              phone: farmer.phone,
              farmName: farmer.farm?.name,
              crops: farmer.farm?.crops ?? undefined,
            });
            if (resolvedSessionId) {
              await applyPendingConsentToFarmer(resolvedSessionId, farmer.farmerId);
            }
            store.completeS1Injection(farmer.farmerId, farmer.name);
            await injectInstrument('S2');
          } catch (err) {
            // Spec 68 — el documentId ya pertenece a otra persona. Nunca
            // fusionar en silencio: detener el avance con el aviso en vez
            // de dejar que caiga al catch genérico de más abajo.
            if (err instanceof DocumentIdCollisionError) {
              setDocumentCollisionPending({
                documentId: err.documentId,
                submittedName: err.submittedName,
                existingFarmerName: err.existingFarmerName,
                offline: false,
              });
              setScreenState('document_collision_pending');
              return;
            }
            throw err;
          }
        } else {
          // Offline: extract farmer locally from S1 responses
          const draft = await extractFarmerLocally(s1SurveyId);
          if (draft) {
            if (draft.collision) {
              // Spec 68, Fase 4 — colisión detectada contra la caché local
              // (criterios 10-11): nunca aplicar la identidad cacheada en
              // silencio. `draft` ya trae la identidad provisional que
              // "Registrar aparte" confirma sin red.
              setDocumentCollisionPending({
                documentId: draft.collision.documentId,
                submittedName: draft.collision.submittedName,
                existingFarmerName: draft.collision.existingName,
                offline: true,
                localDraft: draft,
              });
              setScreenState('document_collision_pending');
              return;
            }

            // Re-caching an already-resolved identity (isProvisional: false)
            // just refreshes cachedAt — harmless, and keeps this branch
            // symmetric with the online one instead of only caching new
            // provisional farmers.
            await cacheFarmerIdentity({
              farmerId: draft.farmerId,
              name: draft.name,
              documentId: draft.documentId,
              phone: draft.phone,
              farmName: draft.farmName,
            });
            if (resolvedSessionId) {
              await applyPendingConsentToFarmer(resolvedSessionId, draft.farmerId);
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
          // Online: sync S2, extract crops, get next step.
          // `s2SurveyId` is local (spec 70, Fase 4) — resolve the real id
          // materialized by processSurveyNow() before calling extractCrops().
          await SyncQueueService.processSurveyNow(s2SurveyId);
          const realS2SurveyId = await surveyDraftStore.getBackendSurveyId(s2SurveyId);
          if (!realS2SurveyId) {
            // Same reasoning as the S1 branch above — never fall back to the
            // local id silently.
            throw new Error(
              `No se pudo sincronizar la encuesta S2 (${s2SurveyId}) antes de extraer los cultivos`,
            );
          }
          const cropsResult = await extractCrops(realS2SurveyId);
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
            advanceWithinCampaign(router, id, `/campaign/${id}/session/${resolvedSessionId}/completed`);
            return;
          }
          const nextStep = await getNextStepOffline(campaign.campaignId, resolvedSessionId, -1);
          if (!nextStep || (!nextStep.stepId && !nextStep.instrument)) {
            advanceWithinCampaign(router, id, `/campaign/${id}/session/${resolvedSessionId}/completed`);
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
            advanceWithinCampaign(router, id, `/campaign/${id}/session/${resolvedSessionId}/completed`);
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
        // Spec 70, Fase 4 — el endpoint solo descarta el duplicado. El
        // reemplazo se inicia igual que cualquier otro instrumento: navegar
        // a `start` sin id previo, para que `beginSurvey()` cree el borrador
        // local y el registro real solo exista al haber respuestas. Antes,
        // el backend creaba de inmediato la fila de reemplazo vacía, que
        // quedaba huérfana si el encuestador abandonaba tras sobrescribir.
        await overwriteSurvey({
          surveyId: duplicatePending.remoteSurveyId!,
          sessionId: storeSessionId!,
        });

        await getOrDownloadInstrument(duplicatePending.instrument.instrumentId);
        setDuplicatePending(null);
        setScreenState('loading');
        advanceWithinCampaign(router, id, `/instrument/${duplicatePending.instrument.instrumentId}/start`);
      } else {
        if (duplicatePending.localSurveyId) {
          await syncQueueStorage.deleteBySurveyId(duplicatePending.localSurveyId);
          await surveyDraftStore.deleteDraft(duplicatePending.localSurveyId);
        }
        await getOrDownloadInstrument(duplicatePending.instrument.instrumentId);
        setDuplicatePending(null);
        setScreenState('loading');
        advanceWithinCampaign(router, id, `/instrument/${duplicatePending.instrument.instrumentId}/start`);
      }
    } catch (err) {
      setModalLoading(false);
      setScreenState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Error al sobrescribir');
    }
  }, [duplicatePending, resolvedSessionId, isOnline, getOrDownloadInstrument, router, id]);

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
        // Spec 70, Fase 10 — antes esta entrada se encolaba con itemType
        // 'survey' (el default) y processSurveyEntry la descartaba en
        // silencio por no tener respuestas: la guarda de la Fase 3 no
        // distinguía "vacío por abandono" de "vacío a propósito". itemType:
        // 'skip-step' la enruta a processSkipStepEntry, que llama a
        // POST /api/surveys/skip-step al sincronizar — el mismo endpoint que
        // usa esta misma función en la rama online, unas líneas arriba.
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
          itemType: 'skip-step',
          instrumentId: duplicatePending.instrument.instrumentId,
        });

        setDuplicatePending(null);
        setModalLoading(false);

        const campaignId = campaign?.campaignId;
        if (!campaignId) {
          advanceWithinCampaign(router, id, `/campaign/${id}/session/${resolvedSessionId}/completed`);
          return;
        }

        const nextStepOffline = await getNextStepOffline(
          campaignId,
          resolvedSessionId,
          duplicatePending.stepOrder,
        );

        if (!nextStepOffline || (!nextStepOffline.stepId && !nextStepOffline.instrument)) {
          advanceWithinCampaign(router, id, `/campaign/${id}/session/${resolvedSessionId}/completed`);
          return;
        }

        store.applyNextStep(nextStepOffline);
        await getOrDownloadInstrument(nextStepOffline.instrument!.instrumentId);
        advanceWithinCampaign(router, id, `/instrument/${nextStepOffline.instrument!.instrumentId}/start`);
      }
    } catch (err) {
      setModalLoading(false);
      setScreenState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Error al saltar paso');
    }
  }, [duplicatePending, resolvedSessionId, isOnline, id, store, getOrDownloadInstrument, router, run]);

  const handleCancel = useCallback(() => {
    setDuplicatePending(null);
    returnToPreSurvey(router, id);
  }, [id, router]);

  // ── document collision handlers (spec 68) ─────────────────────────────────

  // "Corregir el documento": vuelve a la pregunta farmer.documentId de S1a
  // con las respuestas ya digitadas intactas (el store de la encuesta S1
  // sigue inicializado — no hace falta re-crear nada). Funciona igual
  // online y offline: no requiere red. Criterio 9.
  const handleCorrectDocument = useCallback(async () => {
    setModalLoading(true);
    try {
      const { instrumentId } = await fetchInstrumentByCode('S1');
      const instrument = await getOrDownloadInstrument(instrumentId);
      const flatQuestions = flattenSections(instrument.sections);
      const docIndex = flatQuestions.findIndex(
        ({ question }) => question.systemField === 'farmer.documentId',
      );

      setDocumentCollisionPending(null);
      setModalLoading(false);

      if (docIndex >= 0) {
        router.push(`/instrument/${instrumentId}/question/${docIndex}`);
      } else {
        // No debería pasar (S1a siempre tiene la pregunta de documento) —
        // degradar a reintentar en vez de dejar la pantalla muerta.
        hasStarted.current = false;
        run();
      }
    } catch (err) {
      setModalLoading(false);
      setScreenState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Error al volver al documento');
    }
  }, [getOrDownloadInstrument, router, run]);

  // "Es la misma persona" / "Registrar aparte". Offline solo la segunda
  // tiene sentido (el modal oculta la primera, ver `allowSamePerson`):
  // confirma sin red la identidad provisional que `extractFarmerLocally()`
  // ya generó. Online, ambas se declaran contra el backend — la decisión
  // queda registrada (criterios 4 y 5).
  const resolveDocumentCollision = useCallback(async (resolution: 'same_person' | 'separate_person') => {
    if (!documentCollisionPending) return;
    setModalLoading(true);

    try {
      if (documentCollisionPending.offline) {
        const draft = documentCollisionPending.localDraft;
        if (!draft) {
          // No debería pasar (el offline siempre llena localDraft) — evitar
          // dejar el spinner del modal encendido para siempre si ocurre.
          setModalLoading(false);
          return;
        }
        await cacheFarmerIdentity({
          farmerId: draft.farmerId,
          name: draft.name,
          documentId: draft.documentId,
          phone: draft.phone,
          farmName: draft.farmName,
        });
        store.applyLocalFarmer(draft);
        store.completeS1Injection(draft.farmerId, draft.name);
      } else {
        const { s1SurveyId } = useCampaignSessionStore.getState();
        if (!s1SurveyId) {
          setModalLoading(false);
          return;
        }
        // `s1SurveyId` es siempre el id local (spec 70, Fase 4) — nunca lo
        // remapea nada en el store. Para cuando este modal aparece online, S1
        // ya se sincronizó (es como `run()` detectó la colisión en primer
        // lugar, llamando a `extractFarmer()` con el id real), así que
        // `getBackendSurveyId()` debe resolverlo. Mismo patrón que `run()`
        // usa en su propio llamador — bug hallado en la auditoría del
        // 2026-08-24 (informe 31): este segundo llamador quedó con el id
        // local tras el merge del spec 68, y `extractFarmer(s1SurveyId, …)`
        // fallaba con 404 siempre, dejando la pantalla en 'error'.
        const realS1SurveyId = await surveyDraftStore.getBackendSurveyId(s1SurveyId);
        if (!realS1SurveyId) {
          setModalLoading(false);
          setScreenState('error');
          setErrorMessage(
            `No se pudo sincronizar la encuesta S1 (${s1SurveyId}) antes de resolver la colisión`,
          );
          return;
        }
        const { farmer } = await extractFarmer(realS1SurveyId, { resolution });
        await cacheFarmerIdentity({
          farmerId: farmer.farmerId,
          name: farmer.name,
          documentId: farmer.documentId,
          phone: farmer.phone,
          farmName: farmer.farm?.name,
          crops: farmer.farm?.crops ?? undefined,
        });
        store.completeS1Injection(farmer.farmerId, farmer.name);
      }

      setDocumentCollisionPending(null);
      setModalLoading(false);
      setScreenState('loading');
      await injectInstrument('S2');
    } catch (err) {
      setModalLoading(false);
      setScreenState('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Error al resolver la colisión de documento',
      );
    }
  }, [documentCollisionPending, store, injectInstrument]);

  const handleSamePerson = useCallback(
    () => resolveDocumentCollision('same_person'),
    [resolveDocumentCollision],
  );
  const handleSeparatePerson = useCallback(
    () => resolveDocumentCollision('separate_person'),
    [resolveDocumentCollision],
  );

  // TC-068-09 — el botón físico "atrás" de Android no debe dejar la pantalla
  // muerta mientras el aviso está visible. Nada se resolvió en el backend
  // (la colisión sigue pendiente), así que no hace falta limpieza: al salir
  // y reingresar, `run()` vuelve a llamar a `extractFarmer()`/
  // `extractFarmerLocally()` y el aviso reaparece igual.
  const handleDocumentCollisionRequestClose = useCallback(() => {
    setDocumentCollisionPending(null);
    router.back();
  }, [router]);

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
        <ErrorState
          icon={WifiOff}
          title="Sin conexión"
          description={"Necesitas conexión para continuar al siguiente paso.\nEl paso anterior ya fue guardado."}
          primaryLabel="Reintentar"
          onPrimary={() => { hasStarted.current = false; run(); }}
        />
      </SafeAreaView>
    );
  }

  if (screenState === 'offline_extraction_pending') {
    return (
      <SafeAreaView style={styles.root}>
        <ErrorState
          icon={TriangleAlert}
          title="No se pudo identificar al encuestado"
          description="No se pudo leer los datos del encuestado. Conéctate para continuar o continúa sin identificar."
          primaryLabel="Reintentar"
          onPrimary={() => { hasStarted.current = false; run(); }}
          secondaryLabel="Continuar sin identificar"
          onSecondary={() => {
            store.completeS2Injection();
            hasStarted.current = false;
            run();
          }}
        />
      </SafeAreaView>
    );
  }

  if (screenState === 'injection_error') {
    return (
      <SafeAreaView style={styles.root}>
        <ErrorState
          icon={TriangleAlert}
          title="Error identificando encuestado"
          errorDetail={errorMessage}
          description={"Debes identificar al encuestado antes de continuar.\nVuelve y regístralo si aún no existe en el sistema."}
          primaryLabel="Reintentar"
          onPrimary={() => { hasStarted.current = false; run(); }}
          secondaryLabel="Volver a identificar"
          secondaryIcon={ChevronLeft}
          onSecondary={() => returnToPreSurvey(router, id)}
        />
      </SafeAreaView>
    );
  }

  if (screenState === 'error') {
    return (
      <SafeAreaView style={styles.root}>
        <ErrorState
          icon={TriangleAlert}
          title="Error inesperado"
          errorDetail={errorMessage}
          primaryLabel="Reintentar"
          onPrimary={() => { hasStarted.current = false; run(); }}
        />
      </SafeAreaView>
    );
  }

  const stepLabel = store.currentStep
    ? `Paso ${store.currentStep.order} de ${store.currentStep.totalSteps}${store.campaign?.name ? ` · ${store.campaign.name}` : ''}`
    : undefined;
  const progressPercent = store.currentStep
    ? `${Math.round((store.currentStep.order / store.currentStep.totalSteps) * 100)}%`
    : '0%';

  return (
    <SafeAreaView style={styles.root}>
      <DuplicateAlertModal
        visible={screenState === 'duplicate_pending'}
        instrumentName={duplicatePending?.instrument.name ?? ''}
        farmerName={store.farmerName ?? undefined}
        isLoading={modalLoading}
        onOverwrite={handleOverwrite}
        onSkip={handleSkip}
        onCancel={handleCancel}
      />
      <DocumentCollisionModal
        visible={screenState === 'document_collision_pending'}
        documentId={documentCollisionPending?.documentId ?? ''}
        existingFarmerName={documentCollisionPending?.existingFarmerName ?? ''}
        submittedName={documentCollisionPending?.submittedName ?? ''}
        isLoading={modalLoading}
        // Decisión pendiente #3 del spec 74 (2026-08-25): "Es la misma
        // persona" se ve siempre, pero deshabilitada con REQUIERE CONEXIÓN
        // sin red — antes se ocultaba del todo (offline solo hay red para
        // "corregir el documento", ver comentario original de spec 68).
        allowSamePerson={!documentCollisionPending?.offline}
        onCorrectDocument={handleCorrectDocument}
        onSamePerson={handleSamePerson}
        onSeparatePerson={handleSeparatePerson}
        onRequestClose={handleDocumentCollisionRequestClose}
      />
      <View style={styles.center}>
        <SpinningLoader size={42} color={colors.brand} />
        <Text style={styles.loadingLabel}>Cargando siguiente paso…</Text>
        {stepLabel ? <Text style={styles.loadingSubLabel}>{stepLabel}</Text> : null}
        {store.currentStep ? (
          <View style={styles.loadingTrack}>
            <View style={[styles.loadingFill, { width: progressPercent as DimensionValue }]} />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

// Ícono girando con `Animated` en vez de `ActivityIndicator` (spec 74, mapa
// de reemplazo). Copia local del mismo patrón que `login.tsx` y
// `GpsCoordinateInput.tsx` — no hay componente compartido para esto todavía.
function SpinningLoader({ size, color }: { size: number; color: string }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <LoaderCircle size={size} color={color} />
    </Animated.View>
  );
}

// Patrón único de error a pantalla completa (spec 74, Fase 6): ícono lucide
// dentro de un contenedor de 80 px, título, explicación y acciones en el
// pie — reemplaza los 4 bloques casi idénticos que había antes, cada uno con
// su propio emoji gigante (📡 / ⚠️).
function ErrorState({
  icon: Icon,
  title,
  description,
  errorDetail,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  secondaryIcon: SecondaryIcon,
  onSecondary,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  errorDetail?: string | null;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  secondaryIcon?: LucideIcon;
  onSecondary?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.errorScreen}>
      <View style={styles.errorContent}>
        <View style={styles.errorIconWrapper}>
          <Icon size={36} color={colors.warningFg} strokeWidth={2} />
        </View>
        <Text style={styles.title}>{title}</Text>
        {errorDetail ? <Text style={styles.errorDesc}>{errorDetail}</Text> : null}
        {description ? <Text style={styles.desc}>{description}</Text> : null}
      </View>
      <View style={styles.errorFooter}>
        <Pressable style={styles.errorButtonPrimary} onPress={onPrimary} accessibilityRole="button">
          <RefreshCw size={18} color={colors.brandForeground} strokeWidth={2.4} />
          <Text style={styles.errorButtonPrimaryText}>{primaryLabel}</Text>
        </Pressable>
        {secondaryLabel && onSecondary ? (
          <Pressable style={styles.errorButtonSecondary} onPress={onSecondary} accessibilityRole="button">
            {SecondaryIcon ? <SecondaryIcon size={16} color={colors.textPrimary} strokeWidth={2.4} /> : null}
            <Text style={styles.errorButtonSecondaryText}>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 32,
    },
    loadingLabel: { fontSize: 17, fontFamily: Fonts.extraBold, color: colors.textPrimary, marginTop: 22 },
    loadingSubLabel: {
      fontSize: 12.5,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 18,
      marginTop: 9,
    },
    loadingTrack: {
      width: "100%",
      maxWidth: 240,
      height: 5,
      backgroundColor: colors.border,
      borderRadius: 99,
      overflow: "hidden",
      marginTop: 24,
    },
    loadingFill: { height: 5, backgroundColor: colors.brand, borderRadius: 99 },
    title: {
      fontSize: 20,
      fontFamily: Fonts.extraBold,
      color: colors.textPrimary,
      letterSpacing: -0.3,
      textAlign: "center",
      marginBottom: 11,
    },
    desc: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 21,
    },
    errorDesc: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: colors.dangerFg,
      textAlign: "center",
      marginBottom: 6,
    },
    // Estado de error a pantalla completa (spec 74, Fase 6)
    errorScreen: { flex: 1 },
    errorContent: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
    },
    errorIconWrapper: {
      width: 80,
      height: 80,
      borderRadius: 20,
      backgroundColor: colors.warningBg,
      borderWidth: 1,
      borderColor: colors.warningFg,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 22,
    },
    errorFooter: {
      flexShrink: 0,
      padding: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      gap: 10,
    },
    errorButtonPrimary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      backgroundColor: colors.brand,
      borderRadius: 11,
      paddingVertical: 17,
    },
    errorButtonPrimaryText: { fontSize: 15, fontFamily: Fonts.extraBold, color: colors.brandForeground },
    errorButtonSecondary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 11,
      paddingVertical: 15,
    },
    errorButtonSecondaryText: { fontSize: 14, fontFamily: Fonts.bold, color: colors.textPrimary },
  });
}
