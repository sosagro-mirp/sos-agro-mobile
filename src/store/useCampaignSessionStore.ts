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
}));
