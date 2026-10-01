import * as SecureStore from "expo-secure-store";
import { getJwtSubject } from "../lib/jwt";

// Spec 86 (D6): en una tablet compartida cada encuestador conserva su propio
// token, para que la cola sincronice cada envío con el token de su dueño.
// `sosagro_active_user_id` apunta al usuario que está usando la app ahora.
const LEGACY_TOKEN_KEY = "sosagro_access_token";
const ACTIVE_USER_KEY = "sosagro_active_user_id";
const tokenKey = (userId: string) => `sosagro_token_${userId}`;

export const secureStorage = {
  getActiveUserId: () => SecureStore.getItemAsync(ACTIVE_USER_KEY),
  setActiveUserId: (userId: string) => SecureStore.setItemAsync(ACTIVE_USER_KEY, userId),
  clearActiveUserId: () => SecureStore.deleteItemAsync(ACTIVE_USER_KEY),

  getTokenFor: (userId: string) => SecureStore.getItemAsync(tokenKey(userId)),
  saveTokenFor: (userId: string, token: string) =>
    SecureStore.setItemAsync(tokenKey(userId), token),
  deleteTokenFor: (userId: string) => SecureStore.deleteItemAsync(tokenKey(userId)),

  /** Token del usuario activo, o `null` si no hay sesión activa. */
  async getToken(): Promise<string | null> {
    const userId = await SecureStore.getItemAsync(ACTIVE_USER_KEY);
    if (!userId) return null;
    return SecureStore.getItemAsync(tokenKey(userId));
  },

  /**
   * Migra una sola vez la clave única anterior (`sosagro_access_token`) al
   * esquema por usuario. Devuelve el userId migrado, o `null` si no había
   * nada que migrar (o el token no permitió deducir el usuario).
   */
  async migrateLegacyToken(): Promise<string | null> {
    try {
      const legacy = await SecureStore.getItemAsync(LEGACY_TOKEN_KEY);
      if (!legacy) return null;

      const userId = getJwtSubject(legacy);
      if (userId) {
        await SecureStore.setItemAsync(tokenKey(userId), legacy);
        const active = await SecureStore.getItemAsync(ACTIVE_USER_KEY);
        if (!active) await SecureStore.setItemAsync(ACTIVE_USER_KEY, userId);
      }
      await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY);
      return userId;
    } catch {
      return null;
    }
  },
};
