import { eq, desc } from 'drizzle-orm';
import { db } from './db/db';
import { farmPlots } from './db/schema';
import type { PolygonPayload } from '../api/farmPlots';

export interface FarmPlotDraft {
  id: string;
  farmId: string;
  name: string;
  description?: string;
  area?: number;
  polygon: PolygonPayload;
  status: 'draft' | 'synced';
  capturedOffline: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const farmPlotStore = {
  async saveDraft(plot: FarmPlotDraft): Promise<void> {
    await db
      .insert(farmPlots)
      .values({
        id: plot.id,
        farmId: plot.farmId,
        name: plot.name,
        description: plot.description ?? null,
        area: plot.area ?? null,
        polygon: JSON.stringify(plot.polygon),
        status: plot.status,
        capturedOffline: plot.capturedOffline,
        createdAt: plot.createdAt,
        updatedAt: plot.updatedAt,
      })
      .onConflictDoUpdate({
        target: farmPlots.id,
        set: {
          name: plot.name,
          description: plot.description ?? null,
          area: plot.area ?? null,
          polygon: JSON.stringify(plot.polygon),
          status: plot.status,
          updatedAt: plot.updatedAt,
        },
      });
  },

  async loadDraftsByFarm(farmId: string): Promise<FarmPlotDraft[]> {
    const rows = await db
      .select()
      .from(farmPlots)
      .where(eq(farmPlots.farmId, farmId))
      .orderBy(desc(farmPlots.createdAt))
      .all();
    return rows.map(mapRow);
  },

  async loadDraft(farmPlotId: string): Promise<FarmPlotDraft | null> {
    const row = await db
      .select()
      .from(farmPlots)
      .where(eq(farmPlots.id, farmPlotId))
      .get();
    return row ? mapRow(row) : null;
  },

  async markSynced(farmPlotId: string): Promise<void> {
    await db
      .update(farmPlots)
      .set({ status: 'synced', updatedAt: new Date() })
      .where(eq(farmPlots.id, farmPlotId));
  },

  async deleteDraft(farmPlotId: string): Promise<void> {
    await db.delete(farmPlots).where(eq(farmPlots.id, farmPlotId));
  },
};

function mapRow(row: typeof farmPlots.$inferSelect): FarmPlotDraft {
  return {
    id: row.id,
    farmId: row.farmId,
    name: row.name,
    description: row.description ?? undefined,
    area: row.area ?? undefined,
    polygon: JSON.parse(row.polygon) as PolygonPayload,
    status: row.status as 'draft' | 'synced',
    capturedOffline: row.capturedOffline,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
