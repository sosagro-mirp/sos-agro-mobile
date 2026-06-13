import { eq } from 'drizzle-orm';
import { db } from './db/db';
import { instrumentCache } from './db/schema';
import type { InstrumentResponse } from '../types';

export const instrumentCacheStorage = {
  async save(instrument: InstrumentResponse): Promise<void> {
    const now = new Date();
    await db
      .insert(instrumentCache)
      .values({ id: instrument.instrumentId, data: JSON.stringify(instrument), cachedAt: now })
      .onConflictDoUpdate({
        target: instrumentCache.id,
        set: { data: JSON.stringify(instrument), cachedAt: now },
      });
  },

  async get(id: string): Promise<InstrumentResponse | null> {
    const row = await db
      .select()
      .from(instrumentCache)
      .where(eq(instrumentCache.id, id))
      .get();
    return row ? (JSON.parse(row.data) as InstrumentResponse) : null;
  },

  async list(): Promise<InstrumentResponse[]> {
    const rows = await db.select().from(instrumentCache).all();
    return rows.map((r) => JSON.parse(r.data) as InstrumentResponse);
  },

  async remove(id: string): Promise<void> {
    await db.delete(instrumentCache).where(eq(instrumentCache.id, id));
  },

  async clear(): Promise<void> {
    await db.delete(instrumentCache);
  },

  async listCachedIds(): Promise<string[]> {
    const rows = await db.select({ id: instrumentCache.id }).from(instrumentCache).all();
    return rows.map((r) => r.id);
  },
};
