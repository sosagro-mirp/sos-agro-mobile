import { NetworkError, ServerError } from '../api/httpClient';

/**
 * Spec 88 — decisión pura de qué recuperar tras el incidente del 401.
 *
 * Se mantiene separada de `recoverStuckSessions.ts` (que toca la base) para
 * poder probar la decisión sin base de datos viva, igual que
 * `uninstallReadiness.ts` del spec 35.
 *
 * Invariante del spec (criterio 6): el plan **solo** describe cambios de
 * estado. Nunca debe aparecer aquí una lista de cosas a borrar — los datos de
 * campo del incidente viven justamente en las filas que esto toca.
 */

export interface FailedSessionInput {
  localSessionId: string;
  /**
   * `true` si algún dato local sin sincronizar (encuesta, entrada de cola o
   * consentimiento) sigue apuntando a esta sesión por su id local.
   */
  hasData: boolean;
}

export interface StuckQueueEntryInput {
  id: string;
  campaignSessionId: string;
  status: 'failed_validation';
}

export interface SessionRecoveryPlan {
  /** Sesiones `failed` → `pending`, para que `resolveLocalSessions()` las reintente. */
  sessionsToReset: string[];
  /** Entradas `failed_validation` → `pending`, de esas mismas sesiones. */
  entriesToRequeue: string[];
  /** Sesiones `failed` sin datos: se informan, no se tocan. */
  orphanSessionsSkipped: string[];
}

export function planSessionRecovery(input: {
  failedSessions: FailedSessionInput[];
  stuckEntries: StuckQueueEntryInput[];
}): SessionRecoveryPlan {
  const sessionsToReset: string[] = [];
  const orphanSessionsSkipped: string[] = [];

  for (const session of input.failedSessions) {
    if (session.hasData) sessionsToReset.push(session.localSessionId);
    else orphanSessionsSkipped.push(session.localSessionId);
  }

  const recoverable = new Set(sessionsToReset);

  // Solo se re-encola lo que cuelga de una sesión que efectivamente se va a
  // reactivar. Una entrada cuya sesión no aparece como `failed` (ya resuelta, o
  // fallida por otro motivo) se deja como está: re-encolarla la haría volver a
  // `failed_validation` en la siguiente corrida, sin aportar nada.
  const entriesToRequeue = input.stuckEntries
    .filter((entry) => recoverable.has(entry.campaignSessionId))
    .map((entry) => entry.id);

  return { sessionsToReset, entriesToRequeue, orphanSessionsSkipped };
}

/**
 * Spec 88, criterio 7 — qué errores dejan la sesión en `pending` para
 * reintentarla, en vez de marcarla `failed`.
 *
 * El incidente nació justo aquí: `resolveLocalSessions()` trataba cualquier
 * error que no fuera `NetworkError` como definitivo, así que un `401` al
 * arrancar (sync sin token válido) condenaba la sesión y, con ella, todas sus
 * encuestas.
 *
 * - `401`: el token falta o venció. Se resuelve iniciando sesión, no
 *   descartando los datos.
 * - `429`: límite de peticiones por IP — varias tabletas en el mismo wifi
 *   durante un taller. Transitorio por definición.
 * - `NetworkError`: sin conexión o timeout.
 *
 * El resto (400, 403, 404 y cualquier error desconocido) sí es un fallo real de
 * la petición y se mantiene el comportamiento anterior.
 */
export function shouldRetrySessionLater(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof ServerError) return error.status === 401 || error.status === 429;
  return false;
}
