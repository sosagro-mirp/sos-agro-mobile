import { eq } from 'drizzle-orm';
import { db } from './db/db';
import { sessionCrops } from './db/schema';
import type { CropSummary } from '../types';

export const sessionCropsStorage = {
  async save(sessionId: string, crops: CropSummary[]): Promise<void> {
    await db.delete(sessionCrops).where(eq(sessionCrops.sessionId, sessionId));
    if (crops.length === 0) return;
    await db.insert(sessionCrops).values(
      crops.map((c) => ({ sessionId, cropId: c.cropId, cropName: c.name })),
    );
  },

  async get(sessionId: string): Promise<CropSummary[]> {
    const rows = await db
      .select()
      .from(sessionCrops)
      .where(eq(sessionCrops.sessionId, sessionId))
      .all();
    return rows.map((r) => ({ cropId: r.cropId, name: r.cropName }));
  },

  async remove(sessionId: string): Promise<void> {
    await db.delete(sessionCrops).where(eq(sessionCrops.sessionId, sessionId));
  },
};
