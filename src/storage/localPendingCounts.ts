import { and, count, eq, isNull, or, sql } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { db } from './db/db';
import {
  changeRequests,
  consentRecords,
  farmPlots,
  mediaUploadQueue,
  pendingSessions,
  surveys,
  syncQueue,
} from './db/schema';
import type { LocalPendingCounts } from '../lib/uninstallReadiness';
import type { OwnerPendingCounts } from '../lib/logoutGuard';

/**
 * Spec 35, Fase 2 — conteos por tabla y estado para el veredicto «Cambio de
 * app». Solo lectura: una consulta agrupada por estado por tabla, sin cambios
 * de esquema.
 */
async function countByStatus(table: SQLiteTable, statusColumn: SQLiteColumn): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: statusColumn, total: count() })
    .from(table)
    .groupBy(statusColumn);
  const result: Record<string, number> = {};
  for (const row of rows) result[String(row.status)] = Number(row.total);
  return result;
}

/**
 * Sesiones `failed` separadas según tengan o no datos locales sin sincronizar
 * que las referencien por su id local: encuestas no sincronizadas, entradas de
 * la cola o consentimientos no sincronizados. Una sesión `failed` nunca se
 * remapea, así que esos datos siguen apuntando al id local.
 */
async function countFailedSessions(): Promise<{ withData: number; orphan: number }> {
  const rows = await db
    .select({
      // Columnas calificadas a mano: dentro de `sql` Drizzle las emite sin
      // prefijo de tabla, y en una subconsulta correlacionada eso depende de
      // cómo resuelva SQLite los nombres ambiguos.
      hasData: sql<number>`(
        exists (select 1 from surveys s where s.campaign_session_id = pending_sessions.local_session_id and s.status <> 'synced')
        or exists (select 1 from sync_queue q where q.campaign_session_id = pending_sessions.local_session_id)
        or exists (select 1 from consent_records c where c.session_id = pending_sessions.local_session_id and c.status <> 'synced')
      )`,
      total: count(),
    })
    .from(pendingSessions)
    .where(sql`${pendingSessions.status} = 'failed'`)
    .groupBy(sql`1`);
  let withData = 0;
  let orphan = 0;
  for (const row of rows) {
    if (Number(row.hasData) === 1) withData += Number(row.total);
    else orphan += Number(row.total);
  }
  return { withData, orphan };
}

export async function getLocalPendingCounts(): Promise<LocalPendingCounts> {
  const [s, q, m, ps, cr, cn, fp, failed] = await Promise.all([
    countByStatus(surveys, surveys.status),
    countByStatus(syncQueue, syncQueue.status),
    countByStatus(mediaUploadQueue, mediaUploadQueue.status),
    countByStatus(pendingSessions, pendingSessions.status),
    countByStatus(changeRequests, changeRequests.status),
    countByStatus(consentRecords, consentRecords.status),
    countByStatus(farmPlots, farmPlots.status),
    countFailedSessions(),
  ]);

  return {
    surveysDraft: s.draft ?? 0,
    surveysCompleted: s.completed ?? 0,
    syncPending: q.pending ?? 0,
    syncInFlight: q.in_flight ?? 0,
    syncFailedValidation: q.failed_validation ?? 0,
    mediaPending: m.pending ?? 0,
    mediaInFlight: m.in_flight ?? 0,
    mediaFailed: m.failed ?? 0,
    sessionsPending: ps.pending ?? 0,
    sessionsFailed: failed.withData,
    sessionsFailedOrphan: failed.orphan,
    changeRequestsPendingSync: cr.pending_sync ?? 0,
    consentsPending: cn.pending ?? 0,
    consentsFailed: cn.failed ?? 0,
    farmPlotsDraft: fp.draft ?? 0,
  };
}

/**
 * Spec 86 — pendientes de UN encuestador (para la advertencia de "Olvidar esta
 * tablet"). Incluye los registros sin dueño (anteriores a m0013), que se
 * procesan con la sesión activa. Los consentimientos, lotes y saltos de paso
 * viajan por `sync_queue`, así que se distinguen por `item_type`.
 */
export async function getOwnerPendingCounts(ownerUserId: string): Promise<OwnerPendingCounts> {
  const ownedQueue = or(eq(syncQueue.ownerUserId, ownerUserId), isNull(syncQueue.ownerUserId));
  const queueRows = await db
    .select({ itemType: syncQueue.itemType, total: count() })
    .from(syncQueue)
    .where(ownedQueue)
    .groupBy(syncQueue.itemType);
  const byType: Record<string, number> = {};
  for (const r of queueRows) byType[String(r.itemType)] = Number(r.total);

  const [draftRow] = await db
    .select({ total: count() })
    .from(surveys)
    .where(
      and(
        eq(surveys.status, 'draft'),
        or(eq(surveys.ownerUserId, ownerUserId), isNull(surveys.ownerUserId)),
      ),
    );
  const [crRow] = await db
    .select({ total: count() })
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.status, 'pending_sync'),
        or(eq(changeRequests.ownerUserId, ownerUserId), isNull(changeRequests.ownerUserId)),
      ),
    );

  return {
    queue: (byType.survey ?? 0) + (byType['skip-step'] ?? 0),
    drafts: Number(draftRow?.total ?? 0),
    changeRequests: Number(crRow?.total ?? 0),
    consents: byType.consent ?? 0,
    plots: byType['farm-plot'] ?? 0,
  };
}
