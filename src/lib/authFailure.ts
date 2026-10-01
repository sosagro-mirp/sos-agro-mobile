// Spec 86 (D2): distingue un 401 por vencimiento de uno por rechazo de firma,
// comparando el `exp` del token contra la hora del SERVIDOR (cabecera `Date`)
// y no contra el reloj de la tablet, que puede estar desfasado.

import { getJwtExpiry } from "./jwt";
import type { AuthFailureKind } from "./authEvents";

export function classifyAuthFailure(
  token: string,
  serverDateMs: number | null,
): AuthFailureKind {
  const expiryMs = getJwtExpiry(token);
  // Token ilegible: no se puede afirmar que venció; se trata como rechazado.
  if (expiryMs === null) return "rejected";

  const referenceMs =
    serverDateMs !== null && Number.isFinite(serverDateMs) ? serverDateMs : Date.now();
  return expiryMs <= referenceMs ? "expired" : "rejected";
}
