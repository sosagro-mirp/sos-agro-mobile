import { surveyDraftStore } from '../storage/surveyDraftStore';
import { generateLocalId } from './generateLocalId';

/**
 * Spec 70, Fase 1-2 — punto único de inicio de un instrumento.
 *
 * Reemplaza la creación anticipada del registro en el backend (vector 1):
 * `beginSurvey()` nunca llama a `POST /api/surveys`. Siempre genera un id
 * local y crea el borrador en SQLite; el registro real solo existe cuando
 * `SyncQueueService.materializeSurvey()` lo crea al haber al menos una
 * respuesta (ver `SyncQueueService.ts`, Fase 3).
 */
export interface BeginSurveyParams {
  instrumentId: string;
  campaignSessionId?: string;
  farmerId?: string;
  stepOrder?: number;
}

// Guarda de idempotencia contra el doble disparo dentro del mismo tick
// (ej. doble toque en «Comenzar»): dos llamadas concurrentes para la misma
// combinación sesión + instrumento + stepOrder comparten la misma promesa en
// vuelo y devuelven el mismo surveyId, creando un solo borrador. La entrada
// se libera al resolver, así que un reingreso *no concurrente* (segundos o
// minutos después) vuelve a pasar por esta función normalmente — eso es
// responsabilidad de la Fase 2/4, no de esta guarda.
const pendingBegins = new Map<string, Promise<string>>();

function keyFor(params: BeginSurveyParams): string {
  return `${params.campaignSessionId ?? 'no-session'}:${params.instrumentId}:${
    params.stepOrder ?? 'no-step'
  }`;
}

export function beginSurvey(params: BeginSurveyParams): Promise<string> {
  const key = keyFor(params);
  const inFlight = pendingBegins.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const surveyId = generateLocalId('survey');
    await surveyDraftStore.createDraft({
      surveyId,
      instrumentId: params.instrumentId,
      campaignSessionId: params.campaignSessionId,
      farmerId: params.farmerId,
    });
    return surveyId;
  })();

  pendingBegins.set(key, promise);
  return promise.finally(() => {
    pendingBegins.delete(key);
  });
}
