import type { CropSummary, FarmerSearchResult } from '../types/instrument';
import type { FarmerCacheEntry } from '../storage/farmerCache';

/**
 * Spec 81, Fase 1 — fusiona los resultados de red (`searchFarmers()`) con los
 * de la caché local (`farmerCacheStorage.search()`) para que un fallo de red
 * nunca vacíe la lista de agricultores que el encuestador ya conoce.
 *
 * Antes, `PreSurveyForm.tsx` consultaba solo una fuente según `isOnline`: si
 * la red fallaba a mitad de camino, un agricultor presente en `farmerCache`
 * se volvía inalcanzable — el workaround real en producción fue activar modo
 * avión para forzar la rama offline (ver backlog "Falso «Sin conexión»
 * bloquea seleccionar un agricultor ya encuestado").
 */

export interface MergedFarmerResult extends FarmerSearchResult {
  /** true cuando este resultado solo vino de la caché local (no de la red). */
  fromCache: boolean;
}

function cacheEntryToSearchResult(entry: FarmerCacheEntry): FarmerSearchResult {
  const hasFarm = Boolean(entry.farmName) || Boolean(entry.crops && entry.crops.length > 0);
  return {
    farmerId: entry.farmerId,
    name: entry.name,
    documentId: entry.documentId ?? null,
    phone: entry.phone ?? null,
    farm: hasFarm
      ? { name: entry.farmName ?? '', crops: (entry.crops as CropSummary[] | undefined) ?? null }
      : null,
  };
}

/**
 * Clave de deduplicación: el `documentId` cuando existe (es estable entre la
 * red y la caché, a diferencia del id — una entrada de caché puede seguir
 * con un `farmerId` provisional `local_...` mientras la red ya conoce el
 * real). Sin `documentId`, cae al `farmerId`.
 *
 * Límite conocido (corrección de auditoría,
 * docs/reports/auditorias/37-…): sin `documentId` en ninguna de las dos
 * filas, una entrada de caché con `farmerId` provisional `local_...` y su
 * contraparte real de red **no** se detectan como el mismo agricultor y
 * aparecen duplicadas. Resolverlo exigiría comparación de nombres (la misma
 * máquina del spec 68, que vive en `backend/` y no se trae aquí a propósito)
 * — se documenta como limitación, no se enmascara.
 */
function dedupeKey(farmer: FarmerSearchResult): string {
  if (farmer.documentId) {
    return `doc:${farmer.documentId}`;
  }
  return `id:${farmer.farmerId}`;
}

export function mergeFarmerResults(input: {
  network: FarmerSearchResult[];
  cached: FarmerCacheEntry[];
}): MergedFarmerResult[] {
  const byKey = new Map<string, MergedFarmerResult>();

  // La red gana siempre que haya coincidencia: es el dato más fresco.
  for (const farmer of input.network) {
    byKey.set(dedupeKey(farmer), { ...farmer, fromCache: false });
  }

  for (const entry of input.cached) {
    const asResult = cacheEntryToSearchResult(entry);
    const key = dedupeKey(asResult);
    if (byKey.has(key)) continue;
    byKey.set(key, { ...asResult, fromCache: true });
  }

  return Array.from(byKey.values());
}
