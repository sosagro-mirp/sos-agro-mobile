import { create } from 'zustand';
import { buildResponsesPayload } from '../lib/buildResponsesPayload';
import { flattenSections } from '../lib/flattenSections';
import { isQuestionVisible } from '../lib/isQuestionVisible';
import { isAnswerComplete } from '../lib/isAnswerComplete';
import { resolveResumeIndex } from '../lib/resolveResumeIndex';
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
  // Spec 74, Fase 4 — id de la pregunta cuya última respuesta ya terminó de
  // persistirse en SQLite (tras el debounce), para pintar la ficha «Guardado»
  // del chrome. `null` mientras no hay nada guardado para la pregunta actual
  // o mientras el guardado sigue en el debounce. Se limpia al editar de
  // nuevo esa misma pregunta (una edición fresca invalida el guardado
  // anterior hasta que el próximo debounce complete).
  savedQuestionId: string | null;

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
  // Spec 69 — fuente única del índice de reanudación de un borrador (ver
  // `resolveResumeIndex.ts`), derivada de `visibleQuestions()` y `answers` ya
  // presentes en el store tras `initializeSurvey({ restoredAnswers })`.
  // `drafts/index.tsx` la llama *después* de inicializar, en vez de calcular
  // su propio índice — así nunca puede divergir del que usa la pantalla de
  // pregunta (criterio 6 del spec).
  resumeIndex: () => number;
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
  savedQuestionId: null,

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
      savedQuestionId: null,
    });
  },

  setAnswer(questionId, answer) {
    const { surveyId, answers } = get();
    const updated = { ...answers, [questionId]: answer };
    // Una edición fresca invalida la ficha «Guardado» hasta que el próximo
    // debounce complete — evita mostrarla desactualizada mientras se sigue
    // escribiendo.
    set({ answers: updated, savedQuestionId: null });

    if (!surveyId) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      surveyDraftStore
        .saveAnswer(surveyId, questionId, answer)
        .then(() => set({ savedQuestionId: questionId }))
        .catch((err) => logger.error('[Survey] saveAnswer failed', err));
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

  resumeIndex() {
    const { visibleQuestions, answers } = get();
    return resolveResumeIndex(visibleQuestions(), answers);
  },

  async enqueueSubmission(): Promise<SubmitResult> {
    const { surveyId, flattenedQuestions, answers } = get();

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

      // Spec 71 — leer campaignSessionId/stepOrder del borrador persistido,
      // no del estado en memoria de este store. Si la sesión de campaña se
      // resolvió (offline → online) mientras el usuario llenaba la encuesta,
      // el remapeo de SyncQueueService.resolveLocalSessions() actualiza la
      // fila de `surveys` pero no esta copia en memoria — encolar con el id
      // en memoria produce una entrada con un `campaignSessionId` local que
      // ya no tiene resolución posible y queda congelada para siempre.
      const draft = await surveyDraftStore.loadDraft(surveyId);

      await syncQueueStorage.enqueue({
        id: generateId(),
        surveyId,
        campaignSessionId: draft?.campaignSessionId,
        stepOrder: draft?.stepOrder,
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
      savedQuestionId: null,
    });
  },
}));
