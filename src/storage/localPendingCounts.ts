import { count } from 'drizzle-orm';
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

export async function getLocalPendingCounts(): Promise<LocalPendingCounts> {
  const [s, q, m, ps, cr, cn, fp] = await Promise.all([
    countByStatus(surveys, surveys.status),
    countByStatus(syncQueue, syncQueue.status),
    countByStatus(mediaUploadQueue, mediaUploadQueue.status),
    countByStatus(pendingSessions, pendingSessions.status),
    countByStatus(changeRequests, changeRequests.status),
    countByStatus(consentRecords, consentRecords.status),
    countByStatus(farmPlots, farmPlots.status),
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
    sessionsFailed: ps.failed ?? 0,
    changeRequestsPendingSync: cr.pending_sync ?? 0,
    consentsPending: cn.pending ?? 0,
    consentsFailed: cn.failed ?? 0,
    farmPlotsDraft: fp.draft ?? 0,
  };
}
