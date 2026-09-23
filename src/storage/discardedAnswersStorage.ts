import * as FileSystem from "expo-file-system/legacy";
import type { IncompleteNumericUnitAnswer } from "../lib/findIncompleteNumericUnitAnswers";

// Spec 87 (D7, opción B): registro de las respuestas que se enviaron SIN un
// valor a medias, para que no se pierdan en silencio. Va a un archivo JSON, no a
// SQLite: el spec 87 no cambia el esquema. Un fallo aquí nunca debe romper la
// sincronización, así que ninguna función lanza.

const FILE = `${FileSystem.documentDirectory}discarded-answers.json`;
const MAX_ENTRIES = 100;

export interface DiscardedAnswer extends IncompleteNumericUnitAnswer {
  /** Id local de la encuesta (el que ve el borrador). */
  localSurveyId: string;
  /** Id de la encuesta en el servidor. */
  surveyId: string;
  discardedAt: string;
}

async function readAll(): Promise<DiscardedAnswer[]> {
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return [];
    const parsed: unknown = JSON.parse(await FileSystem.readAsStringAsync(FILE));
    return Array.isArray(parsed) ? (parsed as DiscardedAnswer[]) : [];
  } catch {
    return [];
  }
}

export const discardedAnswersStorage = {
  list: readAll,

  async record(
    localSurveyId: string,
    surveyId: string,
    items: IncompleteNumericUnitAnswer[],
  ): Promise<void> {
    if (items.length === 0) return;
    try {
      const existing = await readAll();
      const now = new Date().toISOString();
      const fresh: DiscardedAnswer[] = items.map((item) => ({
        ...item,
        localSurveyId,
        surveyId,
        discardedAt: now,
      }));
      // Un reintento no duplica: misma encuesta + misma pregunta = un solo registro.
      const kept = existing.filter(
        (e) =>
          !fresh.some((f) => f.localSurveyId === e.localSurveyId && f.questionId === e.questionId),
      );
      const next = [...kept, ...fresh].slice(-MAX_ENTRIES);
      await FileSystem.writeAsStringAsync(FILE, JSON.stringify(next));
    } catch {
      // El registro es de auditoría: no debe frenar el envío.
    }
  },

  async clear(): Promise<void> {
    try {
      await FileSystem.deleteAsync(FILE, { idempotent: true });
    } catch {
      // ignorar
    }
  },
};
