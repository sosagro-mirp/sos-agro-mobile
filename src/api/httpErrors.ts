import type { AuthFailureKind } from "../lib/authEvents";

// Clases de error HTTP en un módulo propio (spec 86): así `lib/syncErrorAction`
// y otros consumidores pueden identificarlas sin importar `httpClient`, y las
// suites que simulan `httpClient` completo no dejan `instanceof` sin clase.
// `httpClient.ts` las reexporta: los imports existentes no cambian.

export class NetworkError extends Error {
  constructor(message = "Sin conexión a internet") {
    super(message);
    this.name = "NetworkError";
  }
}

export class ServerError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    // Cuerpo parseado de la respuesta 4xx, cuando lo hay — spec 68: el 409 de
    // colisión de documentId necesita llegar con su payload estructurado
    // ({ documentId, submittedName, existingFarmer }), no solo el mensaje.
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ServerError";
  }
}

/**
 * Spec 86 (D4): 401 de un request que SÍ llevaba token. Hereda de
 * `ServerError` (status 401) para que los chequeos existentes sigan
 * funcionando. Un 401 de `/api/auth/login` (sin token) no llega aquí: sigue
 * siendo un `ServerError` normal ("credenciales incorrectas").
 */
export class AuthRequiredError extends ServerError {
  public readonly kind: AuthFailureKind;
  public readonly token: string;
  public readonly serverDateMs: number | null;

  constructor(
    info: { kind: AuthFailureKind; token: string; serverDateMs: number | null },
    message = "Unauthorized",
    body?: unknown,
  ) {
    super(401, message, body);
    this.name = "AuthRequiredError";
    this.kind = info.kind;
    this.token = info.token;
    this.serverDateMs = info.serverDateMs;
  }
}
