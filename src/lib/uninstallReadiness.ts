/**
 * Spec 35, Fase 2 — veredicto «listo para cambiar de app».
 *
 * Antes de pasar una tableta del APK `preview` a la app de Google Play hay que
 * garantizar que no queda nada local sin sincronizar. El «Todo sincronizado» de
 * la pantalla de Sincronización no basta: solo mira `sync_queue.pending` y los
 * errores, y deja fuera borradores, envíos en curso, adjuntos pendientes,
 * sesiones, solicitudes de cambio, consentimientos y lotes.
 *
 * Función pura: recibe los conteos (ver `getLocalPendingCounts`) y devuelve el
 * veredicto con motivos legibles. «Listo» solo si todos los conteos son 0.
 */

export interface LocalPendingCounts {
  surveysDraft: number;
  surveysCompleted: number;
  syncPending: number;
  syncInFlight: number;
  syncFailedValidation: number;
  mediaPending: number;
  mediaInFlight: number;
  mediaFailed: number;
  sessionsPending: number;
  sessionsFailed: number;
  changeRequestsPendingSync: number;
  consentsPending: number;
  consentsFailed: number;
  farmPlotsDraft: number;
}

export interface UninstallReadiness {
  ready: boolean;
  reasons: string[];
}

type Label = { singular: string; plural: string };

const LABELS: Record<keyof LocalPendingCounts, Label> = {
  surveysDraft: { singular: 'borrador sin terminar', plural: 'borradores sin terminar' },
  surveysCompleted: {
    singular: 'encuesta completada sin sincronizar',
    plural: 'encuestas completadas sin sincronizar',
  },
  syncPending: { singular: 'envío pendiente', plural: 'envíos pendientes' },
  syncInFlight: { singular: 'envío en curso', plural: 'envíos en curso' },
  syncFailedValidation: { singular: 'envío con error', plural: 'envíos con error' },
  mediaPending: { singular: 'adjunto sin subir', plural: 'adjuntos sin subir' },
  mediaInFlight: { singular: 'adjunto subiendo', plural: 'adjuntos subiendo' },
  mediaFailed: { singular: 'adjunto con error', plural: 'adjuntos con error' },
  sessionsPending: { singular: 'sesión pendiente', plural: 'sesiones pendientes' },
  sessionsFailed: { singular: 'sesión con error', plural: 'sesiones con error' },
  changeRequestsPendingSync: {
    singular: 'solicitud de cambio sin enviar',
    plural: 'solicitudes de cambio sin enviar',
  },
  consentsPending: { singular: 'consentimiento pendiente', plural: 'consentimientos pendientes' },
  consentsFailed: { singular: 'consentimiento con error', plural: 'consentimientos con error' },
  farmPlotsDraft: { singular: 'lote en borrador', plural: 'lotes en borrador' },
};

export function evaluateUninstallReadiness(counts: LocalPendingCounts): UninstallReadiness {
  const reasons: string[] = [];

  for (const key of Object.keys(LABELS) as (keyof LocalPendingCounts)[]) {
    const value = counts[key];
    // Un dato inválido nunca puede producir «Listo»: se bloquea igual que un pendiente.
    if (!Number.isInteger(value) || value < 0) {
      reasons.push(`Conteo inválido de ${LABELS[key].plural}`);
      continue;
    }
    if (value === 0) continue;
    const label = value === 1 ? LABELS[key].singular : LABELS[key].plural;
    reasons.push(`${value} ${label}`);
  }

  return { ready: reasons.length === 0, reasons };
}
