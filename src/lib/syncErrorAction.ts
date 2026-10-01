// Spec 86 (D5): qué hacer con un ítem de la cola según el error del envío.
//   network          → como hoy (cuenta como fallo de red)
//   retry_auth       → 401: el ítem vuelve a pendiente, sin sumar intentos
//   retry_transient  → 429: el ítem vuelve a pendiente, sin sumar intentos
//   failed_validation→ 403 y demás 4xx: como hoy

import { AuthRequiredError, NetworkError, ServerError } from "../api/httpErrors";

export type SyncErrorAction =
  | "network"
  | "retry_auth"
  | "retry_transient"
  | "failed_validation";

export function resolveSyncErrorAction(error: unknown): SyncErrorAction {
  if (error instanceof NetworkError) return "network";
  if (error instanceof AuthRequiredError) return "retry_auth";
  if (error instanceof ServerError && error.status === 429) return "retry_transient";
  return "failed_validation";
}
