// Spec 75: validación local de la expiración del JWT, sin llamada de red.
//
// Decodifica únicamente el payload (segunda parte del token) para leer `exp`
// y decidir UX (restaurar sesión offline o pedir login). NO verifica la
// firma — eso solo lo hace el backend en cada request real vía
// `Authorization: Bearer`. No depende de `atob`/`Buffer` (no garantizados en
// Hermes) ni de ninguna dependencia nueva: decodificador base64url manual.

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64UrlToUtf8(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  let bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of padded) {
    if (char === "=") break;
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) throw new Error("Invalid base64 character");

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  // UTF-8 decode del array de bytes resultante.
  let result = "";
  let i = 0;
  while (i < bytes.length) {
    const byte1 = bytes[i++];
    if (byte1 < 0x80) {
      result += String.fromCharCode(byte1);
    } else if (byte1 >= 0xc0 && byte1 < 0xe0 && i < bytes.length) {
      const byte2 = bytes[i++];
      result += String.fromCharCode(((byte1 & 0x1f) << 6) | (byte2 & 0x3f));
    } else if (byte1 >= 0xe0 && i + 1 < bytes.length) {
      const byte2 = bytes[i++];
      const byte3 = bytes[i++];
      result += String.fromCharCode(
        ((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f),
      );
    } else {
      i++;
    }
  }

  return result;
}

/**
 * Devuelve el `exp` (expiración) del payload del JWT en milisegundos desde
 * epoch, o `null` si el token está malformado o no tiene `exp`. Nunca lanza.
 */
export function getJwtExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload: unknown = JSON.parse(base64UrlToUtf8(parts[1]));
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as { exp?: unknown }).exp !== "number"
    ) {
      return null;
    }

    return (payload as { exp: number }).exp * 1000;
  } catch {
    return null;
  }
}

/**
 * `true` si el token ya venció (o está malformado — un token que no se puede
 * leer nunca se trata como válido). `true` también es el resultado seguro
 * ante cualquier duda: fuerza el flujo de login en vez de asumir una sesión
 * viva que no se pudo confirmar.
 */
export function isTokenExpired(token: string): boolean {
  const expiryMs = getJwtExpiry(token);
  if (expiryMs === null) return true;
  return Date.now() >= expiryMs;
}
