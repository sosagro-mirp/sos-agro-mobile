import { create } from 'zustand';
import { buildResponsesPayload } from '../lib/buildResponsesPayload';
import { flattenSections } from '../lib/flattenSections';
import { isQuestionVisible } from '../lib/isQuestionVisible';
import { isAnswerComplete } from '../lib/isAnswerComplete';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { syncQueueStorage } from '../storage/syncQueue';
import { SyncQueueService } from '../sync/SyncQueueService';
import { logger } from '../lib/logger';
import { useSyncStatusStore } from './useSyncStatusStore';
import type {
  FlattenedQuestionItem,
  InstrumentDraftAnswer,
  InstrumentSection,
  SubmitResult,
} from '../types';

interface InstrumentSurveyState {
  surveyId: string | null;
  instrumentId: string | null;
  instrumentName: string;
  campaignSessionId: string | null;
  stepOrder: number | null;
  flattenedQuestions: FlattenedQuestionItem[];
  answers: Record<string, InstrumentDraftAnswer>;
  currentIndex: number;
  isSubmitting: boolean;

  initializeSurvey: (params: {
    surveyId: string;
    instrumentId: string;
    instrumentName: string;
    sections: InstrumentSection[];
    campaignSessionId?: string;
    stepOrder?: number;
    restoredAnswers?: Record<string, InstrumentDraftAnswer>;
  }) => void;
  setAnswer: (questionId: string, answer: InstrumentDraftAnswer) => void;
  goToNext: () => void;
  goToPrev: () => void;
  goToIndex: (index: number) => void;
  canAdvance: () => boolean;
  visibleQuestions: () => FlattenedQuestionItem[];
  enqueueSubmission: () => Promise<SubmitResult>;
  reset: () => void;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 250;

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useInstrumentSurveyStore = create<InstrumentSurveyState>((set, get) => ({
  surveyId: null,
  instrumentId: null,
  instrumentName: '',
  campaignSessionId: null,
  stepOrder: null,
  flattenedQuestions: [],
  answers: {},
  currentIndex: 0,
  isSubmitting: false,

  initializeSurvey({ surveyId, instrumentId, instrumentName, sections, campaignSessionId, stepOrder, restoredAnswers }) {
    const flattenedQuestions = flattenSections(sections);
    set({
      surveyId,
      instrumentId,
      instrumentName,
      campaignSessionId: campaignSessionId ?? null,
      stepOrder: stepOrder ?? null,
      flattenedQuestions,
      answers: restoredAnswers ?? {},
      currentIndex: 0,
      isSubmitting: false,
    });
  },

  setAnswer(questionId, answer) {
    const { surveyId, answers } = get();
    const updated = { ...answers, [questionId]: answer };
    set({ answers: updated });

    if (!surveyId) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      surveyDraftStore.saveAnswer(surveyId, questionId, answer).catch((err) =>
        logger.error('[Survey] saveAnswer failed', err),
      );
    }, DEBOUNCE_MS);
  },

  goToNext() {
    const { currentIndex, visibleQuestions } = get();
    const visible = visibleQuestions();
    if (currentIndex < visible.length - 1) {
      set({ currentIndex: currentIndex + 1 });
    }
  },

  goToPrev() {
    const { currentIndex } = get();
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1 });
    }
  },

  goToIndex(index) {
    const { visibleQuestions } = get();
    const visible = visibleQuestions();
    if (index >= 0 && index < visible.length) {
      set({ currentIndex: index });
    }
  },

  canAdvance() {
    const { currentIndex, answers, visibleQuestions } = get();
    const visible = visibleQuestions();
    const current = visible[currentIndex];
    if (!current) return false;
    return isAnswerComplete(current.question, answers[current.question.questionId]);
  },

  visibleQuestions() {
    const { flattenedQuestions, answers } = get();
    return flattenedQuestions.filter(({ question }) => isQuestionVisible(question, answers));
  },

  async enqueueSubmission(): Promise<SubmitResult> {
    const { surveyId, flattenedQuestions, answers, campaignSessionId, stepOrder } = get();

    if (!surveyId) {
      return { outcome: 'error', message: 'No hay encuesta activa' };
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    set({ isSubmitting: true });

    try {
      // Persist any remaining answers before finalizing
      await surveyDraftStore.saveMultipleAnswers(surveyId, answers);
      await surveyDraftStore.markCompleted(surveyId);

      await syncQueueStorage.enqueue({
        id: generateId(),
        surveyId,
        campaignSessionId: campaignSessionId ?? undefined,
        stepOrder: stepOrder ?? undefined,
      });

      const { isOnline } = useSyncStatusStore.getState();
      if (isOnline) {
        SyncQueueService.processAll().catch(() => {});
      }

      return { outcome: 'saved_offline' };
    } catch (error) {
      return {
        outcome: 'error',
        message: error instanceof Error ? error.message : 'Error al encolar',
      };
    } finally {
      set({ isSubmitting: false });
    }
  },

  reset() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    set({
      surveyId: null,
      instrumentId: null,
      instrumentName: '',
      campaignSessionId: null,
      stepOrder: null,
      flattenedQuestions: [],
      answers: {},
      currentIndex: 0,
      isSubmitting: false,
    });
  },
}));
