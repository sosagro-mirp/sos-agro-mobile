import type { NextStepResponse } from '../types';

/**
 * Spec 91 — decide si el paso que devuelve `getNextStep()` (backend) es
 * confiable o si hay que recalcularlo localmente.
 *
 * Por qué existe: entre `enqueueSubmission()` y la llamada a `getNextStep()`
 * puede mediar una carrera — el bloque recién terminado todavía no llegó al
 * backend (ver spec/91_bloque_repetido_al_avanzar_en_linea.md). El backend
 * arma "pasos completados" únicamente a partir de las encuestas que ya tiene
 * (`campaign-sessions.service.ts:242-247`), así que en ese hueco puede
 * devolver el mismo paso que el encuestador acaba de responder.
 *
 * Esta función es la única fuente de verdad de esa comparación: recibe el
 * paso que propone el backend y la lista de pasos que el dispositivo ya sabe
 * completados (leída de SQLite, no del backend), y decide si conviene
 * confiar en el backend o recalcular localmente con `getNextStepOffline()`.
 */

export interface CompletedStepLocal {
  /** `null`/`undefined` cuando el borrador no llegó a guardar el stepOrder
   * (encuestas muy antiguas, o creadas fuera de una campaña). */
  stepOrder: number | null | undefined;
  instrumentId: string;
}

export type NextStepPlan =
  | { action: 'use-backend' }
  | { action: 'fallback-local' };

/**
 * `backendStep` es `null` o `{}` cuando el backend interpreta que la campaña
 * terminó (mismo contrato que `NextStepResponse` en `getNextStep()`). Ese
 * caso siempre se respeta: no hay nada que comparar contra lo completado
 * localmente.
 */
export function planNextStepAfterCompletion(params: {
  backendStep: NextStepResponse | null | undefined;
  completedLocally: CompletedStepLocal[];
}): NextStepPlan {
  const { backendStep, completedLocally } = params;

  if (!backendStep || !backendStep.stepId || !backendStep.instrument) {
    return { action: 'use-backend' };
  }

  const alreadyCompleted = completedLocally.some((step) => {
    // Comparar primero por stepOrder: es el identificador que usa el propio
    // backend (`completedOrders`) y evita que dos pasos distintos que
    // comparten instrumento (spec no contempla hoy este caso, pero no cuesta
    // nada protegerlo) se confundan entre sí.
    if (step.stepOrder != null && backendStep.order != null) {
      return step.stepOrder === backendStep.order;
    }
    // Sin stepOrder en el borrador (encuesta vieja, o creada fuera de
    // campaña) caemos a comparar por instrumento — más débil, pero mejor que
    // no detectar nada.
    return step.instrumentId === backendStep.instrument!.instrumentId;
  });

  return alreadyCompleted ? { action: 'fallback-local' } : { action: 'use-backend' };
}
