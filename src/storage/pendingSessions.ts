import { and, eq, sql } from 'drizzle-orm';
import { db } from './db/db';
import { pendingSessions } from './db/schema';

export type PendingSessionStatus = 'pending' | 'resolved' | 'failed';

export interface PendingSessionEntry {
  localSessionId: string;
  campaignId: string;
  farmerId?: string;
  userId?: string;
  realSessionId?: string;
  status: PendingSessionStatus;
  createdAt: Date;
  resolvedAt?: Date;
}

function mapRow(row: typeof pendingSessions.$inferSelect): PendingSessionEntry {
  return {
    localSessionId: row.localSessionId,
    campaignId: row.campaignId,
    farmerId: row.farmerId ?? undefined,
    userId: row.userId ?? undefined,
    realSessionId: row.realSessionId ?? undefined,
    status: row.status as PendingSessionStatus,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt ?? undefined,
  };
}

export const pendingSessionStorage = {
  async create(params: {
    localSessionId: string;
    campaignId: string;
    farmerId?: string;
    userId?: string;
  }): Promise<void> {
    await db.insert(pendingSessions).values({
      localSessionId: params.localSessionId,
      campaignId: params.campaignId,
      farmerId: params.farmerId ?? null,
      userId: params.userId ?? null,
      realSessionId: null,
      status: 'pending',
      createdAt: new Date(),
      resolvedAt: null,
    });
  },

  async resolve(localSessionId: string, realSessionId: string): Promise<void> {
    await db
      .update(pendingSessions)
      .set({ realSessionId, status: 'resolved', resolvedAt: new Date() })
      .where(eq(pendingSessions.localSessionId, localSessionId));
  },

  async markFailed(localSessionId: string): Promise<void> {
    await db
      .update(pendingSessions)
      .set({ status: 'failed' })
      .where(eq(pendingSessions.localSessionId, localSessionId));
  },

  async listPending(): Promise<PendingSessionEntry[]> {
    const rows = await db
      .select()
      .from(pendingSessions)
      .where(eq(pendingSessions.status, 'pending'))
      .all();
    return rows.map(mapRow);
  },

  // Spec 88 — hasta ahora `failed` era un estado terminal: `resolveLocalSessions()`
  // solo itera `listPending()`, así que una sesión marcada como fallida no se
  // reintentaba nunca y arrastraba consigo todas sus encuestas. Estas tres
  // funciones son lo que permite recuperarlas.
  async listFailed(): Promise<PendingSessionEntry[]> {
    const rows = await db
      .select()
      .from(pendingSessions)
      .where(eq(pendingSessions.status, 'failed'))
      .all();
    return rows.map(mapRow);
  },

  /**
   * Sesiones `failed` con la marca de si algún dato local sin sincronizar las
   * referencia por su id local. Misma condición que `countFailedSessions()` de
   * `localPendingCounts.ts`, pero fila por fila: una sesión sin datos es una
   * fila huérfana y reactivarla crearía una sesión de campaña vacía en el
   * servidor.
   */
  async listFailedWithDataFlag(): Promise<{ localSessionId: string; hasData: boolean }[]> {
    const rows = await db
      .select({
        localSessionId: pendingSessions.localSessionId,
        // Columnas calificadas a mano: dentro de `sql` Drizzle las emite sin
        // prefijo de tabla, y en una subconsulta correlacionada eso depende de
        // cómo resuelva SQLite los nombres ambiguos.
        hasData: sql<number>`(
          exists (select 1 from surveys s where s.campaign_session_id = pending_sessions.local_session_id and s.status <> 'synced')
          or exists (select 1 from sync_queue q where q.campaign_session_id = pending_sessions.local_session_id)
          or exists (select 1 from consent_records c where c.session_id = pending_sessions.local_session_id and c.status <> 'synced')
        )`,
      })
      .from(pendingSessions)
      .where(eq(pendingSessions.status, 'failed'))
      .all();
    return rows.map((row) => ({
      localSessionId: row.localSessionId,
      hasData: Number(row.hasData) === 1,
    }));
  },

  /**
   * Devuelve una sesión de `failed` a `pending` para que
   * `resolveLocalSessions()` vuelva a intentar crearla en el servidor. Acotada
   * a `failed` a propósito: nunca debe revertir una sesión ya `resolved`.
   */
  async resetToPending(localSessionId: string): Promise<void> {
    await db
      .update(pendingSessions)
      .set({ status: 'pending' })
      .where(
        and(
          eq(pendingSessions.localSessionId, localSessionId),
          eq(pendingSessions.status, 'failed'),
        ),
      );
  },

  async getByLocal(localSessionId: string): Promise<PendingSessionEntry | null> {
    const row = await db
      .select()
      .from(pendingSessions)
      .where(eq(pendingSessions.localSessionId, localSessionId))
      .get();
    return row ? mapRow(row) : null;
  },

  async getByReal(realSessionId: string): Promise<PendingSessionEntry | null> {
    const row = await db
      .select()
      .from(pendingSessions)
      .where(eq(pendingSessions.realSessionId, realSessionId))
      .get();
    return row ? mapRow(row) : null;
  },
};
