import { eq } from 'drizzle-orm';
import { db } from './db/db';
import { consentDocumentCache } from './db/schema';
import type { ConsentDocument } from '../api/consents';

const ACTIVE_KEY = 'active';

/**
 * Spec 78 — caché de la versión de consentimiento actualmente publicada.
 * Fila única (`ACTIVE_KEY`): se sobrescribe en cada descarga de campaña, no
 * se acumulan versiones viejas en el dispositivo.
 */
export const consentDocumentCacheStorage = {
  async save(document: ConsentDocument): Promise<void> {
    const now = new Date();
    await db
      .insert(consentDocumentCache)
      .values({ id: ACTIVE_KEY, data: JSON.stringify(document), cachedAt: now })
      .onConflictDoUpdate({
        target: consentDocumentCache.id,
        set: { data: JSON.stringify(document), cachedAt: now },
      });
  },

  async get(): Promise<ConsentDocument | null> {
    const row = await db
      .select()
      .from(consentDocumentCache)
      .where(eq(consentDocumentCache.id, ACTIVE_KEY))
      .get();
    return row ? (JSON.parse(row.data) as ConsentDocument) : null;
  },
};
