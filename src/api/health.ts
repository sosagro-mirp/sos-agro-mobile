import { API_BASE_URL } from './httpClient';
import { endpoints } from './endpoints';

const HEALTH_TIMEOUT_MS = 5_000;

/**
 * Spec 81, Fase 4 — sondeo de disponibilidad del backend, usado bajo demanda
 * por `NetworkMonitor.probeReachability()` para distinguir "sin conexión"
 * (NetInfo dice que no hay radio) de "servidor inalcanzable" (hay radio, pero
 * el backend no responde: portal cautivo, DNS caído, backend caído).
 *
 * A propósito **no** reutiliza `httpClient.request()`: ese cliente reintenta
 * 5xx con backoff exponencial (hasta ~7s extra) y agrega el token de auth —
 * nada de eso tiene sentido para un sondeo rápido de "¿el servidor contesta
 * algo, lo que sea?". Este `pingApi()` es deliberadamente más simple: un solo
 * intento, timeout corto, sin token, y "responde" = ok sin importar el status
 * HTTP exacto (un 401/503 igual demuestra que el servidor está ahí).
 */
export async function pingApi(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    // Spec 81 — corrección de auditoría (docs/reports/auditorias/37-…):
    // cualquier respuesta HTTP, incluido un 503 (backend degradado/DB caída,
    // ver `health.controller.ts` del backend), demuestra que el servidor
    // contestó — es justo el caso que este sondeo debe distinguir de un
    // `NetworkError` real. El código anterior (`status < 500`) contradecía
    // este docstring.
    await fetch(`${API_BASE_URL}${endpoints.health}`, {
      method: 'GET',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
