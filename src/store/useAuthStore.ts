import { create } from "zustand";
import { login as apiLogin, me as apiMe, type AuthUser } from "../api/auth";
import { secureStorage } from "../storage/secureStorage";

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
      const user = await apiMe(token);
      set({ token, user });
    } catch {
      await secureStorage.deleteToken();
    } finally {
      set({ isRestoring: false });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { accessToken, user } = await apiLogin(email, password);
      await secureStorage.saveToken(accessToken);
      set({ token: accessToken, user, loading: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al iniciar sesión";
      set({ error: message, loading: false });
    }
  },

  logout: async () => {
    await secureStorage.deleteToken();
    set({ token: null, user: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
