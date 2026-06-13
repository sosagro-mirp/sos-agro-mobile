import { eq } from 'drizzle-orm';
import { db } from './db/db';
import { campaignCache } from './db/schema';
import type { CampaignRender } from '../types';

export const campaignCacheStorage = {
  async save(campaign: CampaignRender): Promise<void> {
    const now = new Date();
    await db
      .insert(campaignCache)
      .values({ id: campaign.campaignId, data: JSON.stringify(campaign), cachedAt: now })
      .onConflictDoUpdate({
        target: campaignCache.id,
        set: { data: JSON.stringify(campaign), cachedAt: now },
      });
  },

  async get(id: string): Promise<CampaignRender | null> {
    const row = await db
      .select()
      .from(campaignCache)
      .where(eq(campaignCache.id, id))
      .get();
    return row ? (JSON.parse(row.data) as CampaignRender) : null;
  },

  async list(): Promise<CampaignRender[]> {
    const rows = await db.select().from(campaignCache).all();
    return rows.map((r) => JSON.parse(r.data) as CampaignRender);
  },

  async remove(id: string): Promise<void> {
    await db.delete(campaignCache).where(eq(campaignCache.id, id));
  },

  async clear(): Promise<void> {
    await db.delete(campaignCache);
  },

  async getCachedAt(id: string): Promise<Date | null> {
    const row = await db
      .select({ cachedAt: campaignCache.cachedAt })
      .from(campaignCache)
      .where(eq(campaignCache.id, id))
      .get();
    return row?.cachedAt ?? null;
  },
};
