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
 * veredicto con motivos legibles. «Listo» solo si todos los conteos
 * bloqueantes son 0.
 *
 * Única excepción: una sesión con error que ningún dato local referencia
 * (`sessionsFailedOrphan`). Nada la reintenta ni la borra, así que bloquear por
 * ella dejaría la tableta en «No listo» para siempre sin nada que perder. Se
 * informa como aviso (hallazgo de TC-035-003, 2026-09-16).
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
  /** Sesiones con error que todavía tienen encuestas, envíos o consentimientos sin sincronizar. */
  sessionsFailed: number;
  /** Sesiones con error sin ningún dato local que dependa de ellas. No bloquean. */
  sessionsFailedOrphan: number;
  changeRequestsPendingSync: number;
  consentsPending: number;
  consentsFailed: number;
  farmPlotsDraft: number;
}

export interface UninstallReadiness {
  ready: boolean;
  reasons: string[];
  notices: string[];
}

type Label = { singular: string; plural: string };

type BlockingKey = Exclude<keyof LocalPendingCounts, 'sessionsFailedOrphan'>;

const LABELS: Record<BlockingKey, Label> = {
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
  sessionsFailed: { singular: 'sesión con error y datos', plural: 'sesiones con error y datos' },
  changeRequestsPendingSync: {
    singular: 'solicitud de cambio sin enviar',
    plural: 'solicitudes de cambio sin enviar',
  },
  consentsPending: { singular: 'consentimiento pendiente', plural: 'consentimientos pendientes' },
  consentsFailed: { singular: 'consentimiento con error', plural: 'consentimientos con error' },
  farmPlotsDraft: { singular: 'lote en borrador', plural: 'lotes en borrador' },
};

const ORPHAN_LABEL: Label = {
  singular: 'sesión con error sin datos (no bloquea)',
  plural: 'sesiones con error sin datos (no bloquean)',
};

function isValidCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function describe(value: number, label: Label): string {
  return `${value} ${value === 1 ? label.singular : label.plural}`;
}

export function evaluateUninstallReadiness(counts: LocalPendingCounts): UninstallReadiness {
  const reasons: string[] = [];
  const notices: string[] = [];

  for (const key of Object.keys(LABELS) as BlockingKey[]) {
    const value = counts[key];
    // Un dato inválido nunca puede producir «Listo»: se bloquea igual que un pendiente.
    if (!isValidCount(value)) {
      reasons.push(`Conteo inválido de ${LABELS[key].plural}`);
      continue;
    }
    if (value > 0) reasons.push(describe(value, LABELS[key]));
  }

  const orphans = counts.sessionsFailedOrphan;
  if (!isValidCount(orphans)) {
    reasons.push('Conteo inválido de sesiones con error sin datos');
  } else if (orphans > 0) {
    notices.push(describe(orphans, ORPHAN_LABEL));
  }

  return { ready: reasons.length === 0, reasons, notices };
}
