import { isLocalId } from "./isLocalId";
import { pendingSessionStorage } from "../storage/pendingSessions";

/**
 * Spec 68, Fase 10 — el marcador de colisión guarda el id de sesión que había
 * al mostrar el aviso. Si fue una sesión creada sin conexión, ese id es local y
 * la sincronización lo remapea al real (`pendingSessionStorage.resolve`); al
 * retomar, el orquestador pide el siguiente paso con ese id y el backend no
 * conoce el local. Devuelve el id real si ya existe, o el mismo id si no.
 */
export async function resolveResumeSessionId(sessionId: string): Promise<string> {
  if (!isLocalId(sessionId)) return sessionId;
  try {
    const entry = await pendingSessionStorage.getByLocal(sessionId);
    return entry?.realSessionId ?? sessionId;
  } catch {
    return sessionId;
  }
}
