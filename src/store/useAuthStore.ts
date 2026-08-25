import { create } from "zustand";
import { login as apiLogin, me as apiMe, type AuthUser } from "../api/auth";
import { ServerError } from "../api/httpClient";
import { secureStorage } from "../storage/secureStorage";
import { userStorage } from "../storage/userStorage";
import { isTokenExpired } from "../lib/jwt";

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  isRestoring: boolean;

  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  loading: false,
  error: null,
  isRestoring: true,

  restoreSession: async () => {
    set({ isRestoring: true });
    try {
      const token = await secureStorage.getToken();
      if (!token) return;

      // Spec 75: la expiración se valida localmente (payload del JWT), sin
      // depender de una llamada de red. Un token vencido es la única razón
      // legítima para cerrar la sesión en este punto.
      if (isTokenExpired(token)) {
        await Promise.all([secureStorage.deleteToken(), userStorage.deleteUser()]);
        set({ token: null, user: null });
        return;
      }

      // La sesión se restaura de inmediato con el `user` cacheado —
      // funciona sin conexión. `GET /api/auth/me` es un refresco
      // best-effort en segundo plano, nunca una condición para conservarla.
      const cachedUser = await userStorage.getUser();
      set({ token, user: cachedUser });

      apiMe()
        .then((freshUser) => {
          set({ user: freshUser });
          return userStorage.saveUser(freshUser);
        })
        .catch(async (e) => {
          // 401 real del backend → el token quedó verificablemente
          // inválido (ej. revocado). Cualquier otro error (sin conexión,
          // timeout, 5xx) no es evidencia de invalidez: la sesión
          // restaurada localmente se conserva.
          if (e instanceof ServerError && e.status === 401) {
            await Promise.all([secureStorage.deleteToken(), userStorage.deleteUser()]);
            set({ token: null, user: null });
          }
        });
    } catch {
      // Fallo inesperado leyendo el storage local — no se asume sesión válida.
      await Promise.all([secureStorage.deleteToken(), userStorage.deleteUser()]);
      set({ token: null, user: null });
    } finally {
      set({ isRestoring: false });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { accessToken, user } = await apiLogin(email, password);
      await Promise.all([secureStorage.saveToken(accessToken), userStorage.saveUser(user)]);
      set({ token: accessToken, user, loading: false });
    } catch (e) {
      const message =
        e instanceof ServerError && e.status === 401
          ? "Correo o contraseña incorrectos"
          : e instanceof Error
            ? e.message
            : "Error al iniciar sesión";
      set({ error: message, loading: false });
    }
  },

  logout: async () => {
    await Promise.all([secureStorage.deleteToken(), userStorage.deleteUser()]);
    set({ token: null, user: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
