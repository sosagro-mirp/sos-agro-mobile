// Spec 80. `expo-updates` es un módulo nativo: un `import` estático registra
// componentes que revientan en Expo Go (mismo problema que ya documenta
// `src/lib/sentry.ts` para `@sentry/react-native`), y la API completa solo
// existe en builds de release. Por eso todo acceso pasa por `require()` dentro
// de un `try/catch`, nunca por un import de nivel de módulo.
//
// "Ningún fallo silencioso" (criterio de diseño de la ronda de campo, ver
// `spec/backlog.md` → "Prioridades antes de los próximos talleres"): un canal
// OTA que falla en silencio es un canal que nadie sabe que está roto. Cada
// transición se registra en `logger` y los errores se reportan con
// `captureError`.

import { logger } from './logger';
import { captureError } from './sentry';

export interface OtaStatus {
  /** `false` cuando el módulo nativo no está disponible (Expo Go, dev client sin build, etc). */
  available: boolean;
  isEnabled: boolean | null;
  channel: string | null;
  runtimeVersion: string | null;
  /** `null` mientras se ejecuta el bundle embebido en el APK (aún no se aplicó ningún update). */
  updateId: string | null;
  createdAt: Date | null;
  isEmbeddedLaunch: boolean | null;
}

export type CheckOutcome = 'unavailable' | 'up-to-date' | 'downloaded' | 'error';

export interface CheckResult {
  outcome: CheckOutcome;
  errorMessage?: string;
}

export interface ApplyUpdateGuardInput {
  pendingCount: number;
  hasSurveyInProgress: boolean;
}

export interface ApplyUpdateGuardResult {
  allowed: boolean;
  reason: string | null;
  warning: string | null;
}

/**
 * Carga diferida de `expo-updates`. Devuelve `null` (nunca lanza) cuando el
 * módulo nativo no está disponible.
 */
function loadUpdatesModule(): typeof import('expo-updates') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-updates');
  } catch {
    return null;
  }
}

/**
 * Estado actual del canal OTA, leído directamente del runtime — nunca de la
 * configuración declarada en `app.config.ts`. Es la causa raíz de este spec:
 * el bloque `updates` puede estar perfectamente escrito y el canal seguir
 * muerto si `expo-updates` no está instalado. La única fuente de verdad es
 * `Updates.isEnabled` en el dispositivo (y `ota_updates.is_enabled` en Sentry).
 */
export function getOtaStatus(): OtaStatus {
  const Updates = loadUpdatesModule();
  if (!Updates) {
    return {
      available: false,
      isEnabled: null,
      channel: null,
      runtimeVersion: null,
      updateId: null,
      createdAt: null,
      isEmbeddedLaunch: null,
    };
  }

  return {
    available: true,
    isEnabled: Updates.isEnabled,
    channel: Updates.channel ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
    updateId: Updates.updateId ?? null,
    createdAt: Updates.createdAt ?? null,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  };
}

/**
 * Decide si es seguro recargar la app ahora mismo con una actualización ya
 * descargada. Función **pura**, sin dependencia de `expo-updates`: se prueba
 * sola y no requiere mockear el módulo nativo.
 *
 * - Encuesta en curso → bloquea. Los borradores viven en SQLite y sobreviven,
 *   pero el estado en memoria de una captura activa no está necesariamente
 *   persistido, y una recarga a mitad de captura es indistinguible de un
 *   crash para quien la sufre.
 * - Cola de sync con pendientes → advierte, no bloquea. La cola es persistente
 *   y sobrevive a la recarga; el aviso existe para que quien opera prefiera
 *   esperar a que suba.
 */
export function canApplyUpdateNow(input: ApplyUpdateGuardInput): ApplyUpdateGuardResult {
  if (input.hasSurveyInProgress) {
    return {
      allowed: false,
      reason: 'Hay una encuesta en curso. Termina o guarda el borrador antes de reiniciar.',
      warning: null,
    };
  }

  if (input.pendingCount > 0) {
    return {
      allowed: true,
      reason: null,
      warning: `Hay ${input.pendingCount} elemento${input.pendingCount !== 1 ? 's' : ''} sin sincronizar. Se conservan tras el reinicio, pero conviene esperar a que suban.`,
    };
  }

  return { allowed: true, reason: null, warning: null };
}

/**
 * Busca una actualización en el canal y, si existe, la descarga. Nunca lanza:
 * cualquier fallo (de red, del propio módulo) se registra y se devuelve como
 * resultado `'error'`, nunca desaparece en silencio.
 */
export async function checkAndFetchUpdate(): Promise<CheckResult> {
  const Updates = loadUpdatesModule();
  if (!Updates) {
    return { outcome: 'unavailable' };
  }

  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      logger.info('[OTA] Sin actualizaciones disponibles');
      return { outcome: 'up-to-date' };
    }

    await Updates.fetchUpdateAsync();
    logger.info('[OTA] Actualización descargada, lista para aplicar');
    return { outcome: 'downloaded' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[OTA] Error al buscar/descargar actualización', error);
    captureError(error, { context: 'checkAndFetchUpdate' });
    return { outcome: 'error', errorMessage: message };
  }
}

/**
 * Aplica la actualización ya descargada, recargando la app. El llamador debe
 * haber verificado `canApplyUpdateNow()` antes — esta función no repite esa
 * comprobación para mantenerse simple y no duplicar el acceso a los stores.
 */
export async function applyDownloadedUpdate(): Promise<void> {
  const Updates = loadUpdatesModule();
  if (!Updates) return;

  try {
    logger.info('[OTA] Aplicando actualización descargada, recargando app');
    await Updates.reloadAsync();
  } catch (error) {
    logger.error('[OTA] Error al aplicar la actualización', error);
    captureError(error, { context: 'applyDownloadedUpdate' });
  }
}
