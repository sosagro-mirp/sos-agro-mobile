import { isLocalId } from '../lib/isLocalId';
import { logger } from '../lib/logger';

/**
 * Spec 90 — qué `farmerId` puede viajar al backend al materializar una encuesta.
 *
 * `materializeSurvey()` mandaba `draft.farmerId` tal cual. Si el borrador
 * conservaba un id provisional (`local_farmer_…`), el backend lo rechazaba con
 * `farmerId must be a UUID` (`@IsOptional() @IsUUID()` en `CreateSurveyDto`) y
 * la encuesta entera quedaba condenada en `failed_validation`, sin forma de
 * recuperarla desde la app.
 *
 * El camino de las sesiones ya se protegía así desde el spec 49
 * (`resolveLocalSessions`, «If the farmerId is provisional, don't send it»);
 * esta función lleva la misma idea al de las encuestas, y añade un intento de
 * rescate antes de rendirse.
 *
 * Orden de preferencia, del mejor resultado al peor:
 *   1. El id ya es real  → se envía tal cual.
 *   2. Es provisional pero la caché conoce el UUID real para su documento
 *      → se envía el real, y la encuesta **conserva su vínculo**.
 *   3. No hay forma de resolverlo → se omite el campo. La encuesta entra sin
 *      `farmerId` y el vínculo se recupera por la sesión de campaña.
 *
 * El caso 3 es el último recurso, no la solución: deja `survey.farmer = NULL`,
 * que es justo el agujero silencioso que la Fase 1 encontró en producción
 * (3 encuestas de campo sin agricultor, todas del mismo día). Pero perder el
 * vínculo es mucho menos grave que perder la encuesta.
 */

/** Lo que esta función necesita saber de la caché local, sin acoplarse a ella. */
export interface ConsultaCacheAgricultor {
  /** Documento del agricultor con ese id local, o `null` si no se conoce. */
  documentoDe: (farmerId: string) => Promise<string | null>;
  /** Id del agricultor con ese documento, o `null`. Puede ser local. */
  idRealDe: (documentId: string) => Promise<string | null>;
}

export async function resolveDraftFarmerId(
  draftFarmerId: string | null | undefined,
  cache: ConsultaCacheAgricultor,
): Promise<string | undefined> {
  if (!draftFarmerId) return undefined;
  if (!isLocalId(draftFarmerId)) return draftFarmerId;

  try {
    const documento = await cache.documentoDe(draftFarmerId);
    if (!documento) {
      logger.warn(
        `[Sync] farmerId provisional ${draftFarmerId} sin documento en caché: se envía la encuesta sin agricultor`,
      );
      return undefined;
    }

    const idReal = await cache.idRealDe(documento);
    // Un id que sigue siendo local no resuelve nada: enviarlo repetiría el 400.
    if (!idReal || isLocalId(idReal)) {
      logger.warn(
        `[Sync] documento ${documento} aún sin id real en caché: se envía la encuesta sin agricultor`,
      );
      return undefined;
    }

    logger.info(`[Sync] farmerId provisional ${draftFarmerId} resuelto a ${idReal}`);
    return idReal;
  } catch (err) {
    // Una caché rota no puede costar una encuesta: se omite el vínculo y sigue.
    logger.error('[Sync] fallo consultando la caché de agricultores, se omite el farmerId', err);
    return undefined;
  }
}
