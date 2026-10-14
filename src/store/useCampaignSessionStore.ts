import { create } from 'zustand';
import type {
  CampaignRender,
  CampaignSessionResponse,
  NextStepResponse,
} from '../types';
import type { LocalFarmerDraft } from '../lib/extractFarmerLocally';

type SessionPhase = 'idle' | 'pre_survey' | 'in_step' | 'completed';
// Spec 84 — 'registro' es el flujo nuevo (un solo instrumento S_REG);
// 's1'/'s2' se conservan como respaldo mientras S_REG no esté disponible.
type InjectionPhase = 'none' | 'registro' | 's1' | 's2';

interface CurrentStep {
  stepId: string;
  order: number;
  instrumentId: string;
  instrumentName: string;
  totalSteps: number;
  completedCount: number;
}

interface CampaignSessionState {
  phase: SessionPhase;
  campaign: CampaignRender | null;
  sessionId: string | null;
  currentStep: CurrentStep | null;
  error: string | null;

  // Farmer identification
  farmerId: string | null;
  farmerName: string | null;
  isNewFarmer: boolean;

  // S1/S2 injection tracking (registro: spec 84, un solo instrumento)
  injectionPhase: InjectionPhase;
  registroSurveyId: string | null;
  s1SurveyId: string | null;
  s2SurveyId: string | null;

  // Offline session tracking
  isOfflineSession: boolean;
  localSessionId: string | null;
  localFarmerId: string | null;

  /**
   * Cambio de alcance (2026-08-28, spec 78, Fase 14) — el consentimiento ya
   * no bloquea `pre-survey → orchestrator`. Este flag alimenta el aviso
   * persistente del orquestador (Fase 15), fijado por `pre-survey.tsx` con
   * el resultado de `needsConsent()` y limpiado al registrar la constancia.
   */
  consentPending: boolean;

  /**
   * Spec 91 — id (local o real) de la última encuesta de campaña marcada
   * como completada, pendiente de confirmar en el backend antes de pedir el
   * siguiente paso. `completed.tsx` lo fija justo antes de volver al
   * orquestador; la rama en línea de `run()` lo consume con
   * `processSurveyNow()` y lo limpia. Ver spec/91_bloque_repetido_al_avanzar_en_linea.md.
   */
  lastCompletedSurveyId: string | null;

  /**
   * Spec 68, Fase 8 — "Corregir el documento" del aviso de colisión. Mientras
   * está activo, la pantalla de pregunta sabe que el encuestador entró a
   * corregir un único dato y no a seguir llenando S1a: al confirmar la
   * pregunta vuelve al orquestador en vez de avanzar a la siguiente.
   * `questionId` es la pregunta `farmer.documentId` de S1a.
   */
  documentCorrection: { instrumentId: string; questionId: string } | null;

  /**
   * Documento ya corregido y pendiente de enviar al backend. Se pasa como
   * `correctedDocumentId` en el siguiente `extractFarmer()` — reenviar la
   * encuesta no sirve: para este punto ya está sincronizada y
   * `ResponsesService.createMany()` ignora un batch cuya encuesta ya tiene
   * respuestas.
   */
  pendingCorrectedDocumentId: string | null;

  startSession: (campaign: CampaignRender) => void;
  applySessionResponse: (response: CampaignSessionResponse) => void;
  applyNextStep: (nextStep: NextStepResponse) => void;
  markStepCompleted: () => void;
  markCompleted: () => void;
  setError: (message: string) => void;
  reset: () => void;

  // Farmer identification actions
  setNewFarmerMode: (flow?: 'registro' | 's1') => void;
  setSelectedFarmer: (farmerId: string, farmerName: string) => void;
  setInjectionRegistroSurveyId: (surveyId: string) => void;
  setInjectionS1SurveyId: (surveyId: string) => void;
  setInjectionS2SurveyId: (surveyId: string) => void;
  /** Spec 84 — el Registro resuelve productor y cultivos de una vez; no encadena a una segunda fase. */
  completeRegistroInjection: (farmerId: string, farmerName: string) => void;
  completeS1Injection: (farmerId: string, farmerName: string) => void;
  completeS2Injection: () => void;
  // Offline session actions
  applyOfflineSession: (localSessionId: string) => void;
  resolveSession: (realSessionId: string) => void;
  applyLocalFarmer: (draft: LocalFarmerDraft) => void;
  resolveFarmer: (realFarmerId: string) => void;
  setConsentPending: (pending: boolean) => void;
  /** Spec 91 — registra el último bloque terminado, pendiente de esperar antes de avanzar. */
  setLastCompletedSurveyId: (surveyId: string) => void;
  /** Spec 91 — consumido (ya se esperó / se cayó al camino local); nada más que hacer con él. */
  clearLastCompletedSurveyId: () => void;
  // Corrección del documento tras un aviso de colisión (spec 68, Fase 8)
  startDocumentCorrection: (instrumentId: string, questionId: string) => void;
  applyDocumentCorrection: (documentId: string) => void;
  clearDocumentCorrection: () => void;
  clearPendingCorrectedDocumentId: () => void;
}

const initialState = {
  phase: 'idle' as SessionPhase,
  campaign: null,
  sessionId: null,
  currentStep: null,
  error: null,
  farmerId: null,
  farmerName: null,
  isNewFarmer: false,
  injectionPhase: 'none' as InjectionPhase,
  registroSurveyId: null,
  s1SurveyId: null,
  s2SurveyId: null,
  isOfflineSession: false,
  localSessionId: null,
  localFarmerId: null,
  consentPending: false,
  lastCompletedSurveyId: null,
  documentCorrection: null as { instrumentId: string; questionId: string } | null,
  pendingCorrectedDocumentId: null as string | null,
};

export const useCampaignSessionStore = create<CampaignSessionState>((set, get) => ({
  ...initialState,

  startSession(campaign) {
    set({ ...initialState, campaign, phase: 'pre_survey' });
  },

  applySessionResponse(response) {
    set({ sessionId: response.sessionId });
  },

  applyNextStep(nextStep) {
    if (!nextStep.stepId || !nextStep.instrument) {
      set({ phase: 'completed' });
      return;
    }

    set({
      phase: 'in_step',
      currentStep: {
        stepId: nextStep.stepId,
        order: nextStep.order ?? 0,
        instrumentId: nextStep.instrument.instrumentId,
        instrumentName: nextStep.instrument.name,
        totalSteps: nextStep.totalSteps ?? 0,
        completedCount: nextStep.completedCount ?? 0,
      },
    });
  },

  markStepCompleted() {
    const { currentStep } = get();
    if (!currentStep) return;
    set({
      currentStep: {
        ...currentStep,
        completedCount: currentStep.completedCount + 1,
      },
    });
  },

  markCompleted() {
    set({ phase: 'completed', currentStep: null });
  },

  setError(message) {
    set({ error: message });
  },

  reset() {
    set(initialState);
  },

  setNewFarmerMode(flow = 'registro') {
    set({ isNewFarmer: true, injectionPhase: flow, farmerId: null, farmerName: null });
  },

  setSelectedFarmer(farmerId, farmerName) {
    set({ isNewFarmer: false, injectionPhase: 'none', farmerId, farmerName });
  },

  setInjectionRegistroSurveyId(surveyId) {
    set({ registroSurveyId: surveyId });
  },

  setInjectionS1SurveyId(surveyId) {
    set({ s1SurveyId: surveyId });
  },

  setInjectionS2SurveyId(surveyId) {
    set({ s2SurveyId: surveyId });
  },

  completeRegistroInjection(farmerId, farmerName) {
    set({ injectionPhase: 'none', farmerId, farmerName });
  },

  completeS1Injection(farmerId, farmerName) {
    set({ injectionPhase: 's2', farmerId, farmerName });
  },

  completeS2Injection() {
    set({ injectionPhase: 'none' });
  },

  applyOfflineSession(localSessionId) {
    set({ sessionId: localSessionId, isOfflineSession: true, localSessionId });
  },

  resolveSession(realSessionId) {
    set({ sessionId: realSessionId, isOfflineSession: false });
  },

  applyLocalFarmer(draft) {
    set({
      farmerId: draft.farmerId,
      farmerName: draft.name,
      localFarmerId: draft.isProvisional ? draft.farmerId : null,
    });
  },

  resolveFarmer(realFarmerId) {
    set({ farmerId: realFarmerId, localFarmerId: null });
  },

  setConsentPending(pending) {
    set({ consentPending: pending });
  },

  setLastCompletedSurveyId(surveyId) {
    set({ lastCompletedSurveyId: surveyId });
  },

  clearLastCompletedSurveyId() {
    set({ lastCompletedSurveyId: null });
  },

  startDocumentCorrection(instrumentId, questionId) {
    set({ documentCorrection: { instrumentId, questionId } });
  },

  // El modo se cierra al aplicar la corrección: el encuestador ya vuelve al
  // orquestador, y lo único que sobrevive es el documento pendiente de enviar.
  applyDocumentCorrection(documentId) {
    set({ documentCorrection: null, pendingCorrectedDocumentId: documentId });
  },

  clearDocumentCorrection() {
    set({ documentCorrection: null });
  },

  clearPendingCorrectedDocumentId() {
    set({ pendingCorrectedDocumentId: null });
  },
}));
