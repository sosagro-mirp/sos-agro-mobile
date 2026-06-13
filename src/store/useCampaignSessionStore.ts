import { create } from 'zustand';
import type {
  CampaignRender,
  CampaignSessionResponse,
  NextStepResponse,
  PreSurveyFormData,
} from '../types';

type SessionPhase = 'idle' | 'pre_survey' | 'in_step' | 'completed';

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
  preSurveyData: PreSurveyFormData | null;
  currentStep: CurrentStep | null;
  error: string | null;

  startSession: (campaign: CampaignRender) => void;
  setPreSurveyData: (data: PreSurveyFormData) => void;
  applySessionResponse: (response: CampaignSessionResponse) => void;
  applyNextStep: (nextStep: NextStepResponse) => void;
  markStepCompleted: () => void;
  markCompleted: () => void;
  setError: (message: string) => void;
  reset: () => void;
}

const initialState = {
  phase: 'idle' as SessionPhase,
  campaign: null,
  sessionId: null,
  preSurveyData: null,
  currentStep: null,
  error: null,
};

export const useCampaignSessionStore = create<CampaignSessionState>((set, get) => ({
  ...initialState,

  startSession(campaign) {
    set({ ...initialState, campaign, phase: 'pre_survey' });
  },

  setPreSurveyData(data) {
    set({ preSurveyData: data });
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
}));
