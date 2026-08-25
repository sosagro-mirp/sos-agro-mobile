import * as SecureStore from "expo-secure-store";
import type { AuthUser } from "../api/auth";

// Spec 75: cachear el perfil del usuario autenticado localmente para que
// `restoreSession()` pueda poblar `user` sin depender de `GET /api/auth/me`
// al arrancar sin conexión. Mismo patrón que `themeStorage.ts`: valores
// pequeños y no relacionales en `expo-secure-store`, no en SQLite.
const CACHED_USER_KEY = "sosagro_cached_user";

function isAuthUser(value: unknown): value is AuthUser {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AuthUser).userId === "string" &&
    typeof (value as AuthUser).email === "string"
  );
}

export const userStorage = {
  async getUser(): Promise<AuthUser | null> {
    try {
      const stored = await SecureStore.getItemAsync(CACHED_USER_KEY);
      if (!stored) return null;
      const parsed: unknown = JSON.parse(stored);
      return isAuthUser(parsed) ? parsed : null;
    } catch {
      // JSON corrupto o storage inaccesible — tratar como ausente, nunca lanzar.
      return null;
    }
  },

  saveUser: (user: AuthUser) =>
    SecureStore.setItemAsync(CACHED_USER_KEY, JSON.stringify(user)),

  deleteUser: () => SecureStore.deleteItemAsync(CACHED_USER_KEY),
};
