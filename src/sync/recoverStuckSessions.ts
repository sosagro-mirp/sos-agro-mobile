import { logger } from '../lib/logger';
import { pendingSessionStorage } from '../storage/pendingSessions';
import { syncQueueStorage } from '../storage/syncQueue';
import { planSessionRecovery, type StuckQueueEntryInput } from './planSessionRecovery';

/**
 * Spec 88 — recuperación de encuestas atascadas por una sesión de campaña que
 * quedó en `failed`.
 *
 * Contexto del incidente: un `401` al arrancar marcaba la sesión provisional
 * como `failed`; como `resolveLocalSessions()` solo reintenta las `pending`,
 * esa sesión no se recuperaba nunca y cada encuesta encolada contra ella
 * terminaba en `failed_validation`. Los datos siguen intactos en `surveys` +
 * `responses`: lo único roto es el estado de la cola.
 *
 * Garantías (criterios 5 y 6 del spec):
 * - **No borra nada**, en ningún caso. Solo cambia estados.
 * - **Idempotente**: una segunda corrida no encuentra nada que hacer, porque
 *   las filas ya no están en `failed` / `failed_validation`.
 *
 * Es manual a propósito (un botón, no un arranque automático): la OTA alcanza
 * todas las tabletas del canal, no solo las afectadas.
 */

export interface SessionRecoveryReport {
  sessionsRecovered: number;
  surveysRequeued: number;
  orphanSessionsSkipped: number;
}

export async function recoverStuckSessions(): Promise<SessionRecoveryReport> {
  const failedSessions = await pendingSessionStorage.listFailedWithDataFlag();
  const failedEntries = await syncQueueStorage.listFailed();

  const stuckEntries: StuckQueueEntryInput[] = failedEntries
    .filter((entry): entry is typeof entry & { campaignSessionId: string } =>
      Boolean(entry.campaignSessionId),
    )
    .map((entry) => ({
      id: entry.id,
      campaignSessionId: entry.campaignSessionId,
      status: 'failed_validation',
    }));

  const plan = planSessionRecovery({ failedSessions, stuckEntries });

  if (
    plan.sessionsToReset.length === 0 &&
    plan.entriesToRequeue.length === 0 &&
    plan.orphanSessionsSkipped.length === 0
  ) {
    logger.info('[Recovery] nada que recuperar');
    return { sessionsRecovered: 0, surveysRequeued: 0, orphanSessionsSkipped: 0 };
  }

  // Primero las sesiones: si la app muriera entre los dos bucles, la siguiente
  // corrida encuentra las entradas todavía en `failed_validation` y las
  // re-encola igual, porque su sesión ya no aparece como `failed`... salvo que
  // ya esté `pending`, que es justo lo que necesita `resolveLocalSessions()`.
  for (const localSessionId of plan.sessionsToReset) {
    await pendingSessionStorage.resetToPending(localSessionId);
    logger.info(`[Recovery] sesión ${localSessionId}: failed → pending`);
  }

  for (const entryId of plan.entriesToRequeue) {
    await syncQueueStorage.resetToRetry(entryId);
    logger.info(`[Recovery] entrada ${entryId}: failed_validation → pending`);
  }

  for (const localSessionId of plan.orphanSessionsSkipped) {
    logger.warn(
      `[Recovery] sesión ${localSessionId} sigue con error: ningún dato local la referencia (huérfana), no se reactiva`,
    );
  }

  const report: SessionRecoveryReport = {
    sessionsRecovered: plan.sessionsToReset.length,
    surveysRequeued: plan.entriesToRequeue.length,
    orphanSessionsSkipped: plan.orphanSessionsSkipped.length,
  };

  logger.info(
    `[Recovery] recuperadas ${report.sessionsRecovered} sesiones y ${report.surveysRequeued} encuestas; ${report.orphanSessionsSkipped} huérfanas omitidas`,
  );

  return report;
}

/**
 * ¿Hay algo que recuperar? Lo consulta la pantalla de Sincronización para
 * mostrar el botón solo cuando tiene sentido.
 */
export async function hasStuckSessions(): Promise<boolean> {
  const failedSessions = await pendingSessionStorage.listFailedWithDataFlag();
  return failedSessions.some((session) => session.hasData);
}
