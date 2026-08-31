import { NetworkError } from '../api/httpClient';

/**
 * Spec 81, Fase 2 — reintento con backoff acotado al camino **interactivo**
 * (el encuestador está esperando en pantalla), a diferencia del reintento de
 * `httpClient` (solo 5xx) y del de `SyncQueueService` (fondo, sin límite de
 * tiempo). Solo reintenta `NetworkError`: un `ServerError` o una
 * `DocumentIdCollisionError` son respuestas reales del backend que la UI
 * debe mostrar de inmediato, nunca enmascarar con un reintento silencioso.
 *
 * Contexto: `extractFarmer()`/`extractCrops()` en la transición S1a→S1b
 * fallaban ante cualquier microcorte de red (medido: `/api/health` respondía
 * en <300ms el mismo día) y obligaban al encuestador a tocar "Reintentar"
 * varias veces a mano, con un mensaje ("Sin conexión") que además era falso.
 */

export interface WithNetworkRetryOptions {
  /** Número total de intentos (incluido el primero). Default: 3. */
  attempts?: number;
  /** Base del backoff exponencial en ms. Default: 500. */
  baseDelayMs?: number;
  /** Se llama antes de cada reintento (no en el primer intento) con el número de intento que va a correr (1-indexado desde el primer reintento). */
  onRetry?: (attempt: number) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withNetworkRetry<T>(
  operation: () => Promise<T>,
  options: WithNetworkRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!(error instanceof NetworkError)) {
        throw error;
      }

      if (attempt >= attempts) {
        break;
      }

      options.onRetry?.(attempt);

      // Backoff exponencial con jitter para no sincronizar reintentos entre
      // varios dispositivos de la misma red rural.
      const jitter = Math.random() * baseDelayMs * 0.3;
      await sleep(baseDelayMs * 2 ** (attempt - 1) + jitter);
    }
  }

  throw lastError;
}
