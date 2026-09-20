import { create } from "zustand";
import { login as apiLogin, me as apiMe, type AuthUser } from "../api/auth";
import { AuthRequiredError, NetworkError, ServerError } from "../api/httpClient";
import { secureStorage } from "../storage/secureStorage";
import { userStorage } from "../storage/userStorage";
import { offlineCredentialStorage } from "../storage/offlineCredentialStorage";
import {
  createOfflineCredential,
  evaluateOfflineLogin,
  registerFailedAttempt,
  registerSuccessfulLogin,
  verifyOfflinePassword,
} from "../lib/offlineCredential";
import { authEvents } from "../lib/authEvents";
import { isTokenExpired } from "../lib/jwt";
import { useSyncStatusStore } from "./useSyncStatusStore";
import { useCampaignSessionStore } from "./useCampaignSessionStore";
import { useInstrumentSurveyStore } from "./useInstrumentSurveyStore";
import { SyncQueueService } from "../sync/SyncQueueService";
import { syncQueueStorage } from "../storage/syncQueue";

/**
 * Spec 86 (D1): estado de la sesión con el SERVIDOR, independiente de la
 * sesión local. Un token vencido nunca cierra la sesión local: solo pasa este
 * estado a `reauth_required`.
 */
export type ServerState = "valid" | "unknown" | "reauth_required";

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  serverState: ServerState;
  loading: boolean;
  error: string | null;
  isRestoring: boolean;

  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  /** Renueva el token del usuario activo (aviso de sesión por renovar). */
  reauthenticate: (password: string) => Promise<void>;
  /** Vuelve al selector conservando token, credencial y cola. */
  switchUser: () => Promise<void>;
  /** Cierra sesión y olvida al usuario activo en esta tablet. Nunca toca SQLite. */
  forgetDevice: () => Promise<void>;
  /** Habilita el ingreso sin conexión para una sesión previa a la actualización. */
  enableOfflineLogin: (password: string) => Promise<void>;
  clearError: () => void;
}

const LOGIN_ERROR_MESSAGES = {
  badCredentials: "Correo o contraseña incorrectos",
  needsConnection:
    "Este usuario todavía no ha ingresado en esta tablet. El primer ingreso requiere conexión a internet.",
  requiresOnline:
    "Para entrar necesitas conexión a internet. Ingresa una vez con conexión para volver a habilitar el ingreso sin conexión.",
  passwordChanged: "Tu contraseña cambió. Ingresa con la nueva contraseña.",
} as const;

function offlineDeniedMessage(
  decision: Extract<ReturnType<typeof evaluateOfflineLogin>, { allowed: false }>,
): string {
  if (decision.reason === "locked") {
    const minutes = Math.max(1, Math.ceil(((decision.lockedUntil ?? Date.now()) - Date.now()) / 60_000));
    return `Demasiados intentos. Inténtalo de nuevo en ${minutes} min.`;
  }
  return LOGIN_ERROR_MESSAGES.requiresOnline;
}

/** Persiste sesión activa + credencial + selector tras un login en línea. */
async function persistOnlineLogin(
  accessToken: string,
  user: AuthUser,
  password: string,
): Promise<void> {
  await Promise.all([
    secureStorage.saveTokenFor(user.userId, accessToken),
    userStorage.saveUser(user),
  ]);
  await secureStorage.setActiveUserId(user.userId);

  const cred = await createOfflineCredential({
    userId: user.userId,
    email: user.email,
    password,
    profile: user,
  });
  await offlineCredentialStorage.saveCredential(cred);
  await offlineCredentialStorage.upsertKnownUser({
    userId: user.userId,
    name: user.name,
    lastName: user.lastName,
    email: user.email,
    lastOnlineLoginAt: cred.lastOnlineLoginAt,
  });

  // M1 (auditoría 44, D7): máximo 10 usuarios por tablet. Sale el más antiguo
  // sin pendientes; nunca quien acaba de ingresar ni quien tenga cola.
  try {
    const owners = new Set(
      (await syncQueueStorage.listPendingOwners()).filter((o): o is string => !!o),
    );
    owners.add(user.userId);
    const evicted = await offlineCredentialStorage.evictExcess(owners);
    await Promise.all(evicted.map((id) => secureStorage.deleteTokenFor(id)));
  } catch {
    // La limpieza es de mantenimiento: un fallo no debe impedir el ingreso.
  }
}

async function clearActiveSession(): Promise<void> {
  await secureStorage.clearActiveUserId();
  await userStorage.deleteUser();
  useCampaignSessionStore.getState().reset();
  useInstrumentSurveyStore.getState().reset();
}

export const useAuthStore = create<AuthState>((set, get) => {
  const applyServerState = (serverState: ServerState) => {
    set({ serverState });
    useSyncStatusStore.getState().setAuthBlocked(serverState === "reauth_required");
  };

  // D3: httpClient avisa de cada 401 con token. Solo reaccionamos si el token
  // rechazado es el del usuario activo (la sync de otros dueños no cierra la
  // sesión de quien esté usando la tablet).
  authEvents.subscribe((event) => {
    void applyAuthFailure(event.kind, event.token);
  });

  /**
   * Reacción a un 401 del usuario activo. Idempotente: llega tanto por
   * `authEvents` como por el error propagado al llamador; el segundo aviso
   * encuentra `token` ya distinto y no hace nada.
   */
  async function applyAuthFailure(kind: "expired" | "rejected", token: string) {
    if (token !== get().token) return;
    if (kind === "expired") {
      applyServerState("reauth_required");
      return;
    }
    await handleRejectedSession();
  }

  /** 401 por firma rechazada: cierra la sesión local, exige ingreso en línea. */
  async function handleRejectedSession() {
    const userId = get().user?.userId;
    // Síncrono, antes de cualquier await: evita que un segundo aviso repita el cierre.
    set({ token: null, user: null, serverState: "unknown" });
    useSyncStatusStore.getState().setAuthBlocked(false);
    if (userId) await offlineCredentialStorage.markRequiresOnlineLogin(userId);
    await clearActiveSession();
  }

  /** 404 en /me: el usuario ya no existe en el servidor. */
  async function handleDeletedUser(userId: string) {
    await secureStorage.deleteTokenFor(userId);
    await offlineCredentialStorage.deleteCredential(userId);
    await offlineCredentialStorage.removeKnownUser(userId);
    await clearActiveSession();
    set({ token: null, user: null, serverState: "unknown" });
    useSyncStatusStore.getState().setAuthBlocked(false);
  }

  /** Login local contra la credencial guardada. */
  async function loginOffline(email: string, password: string): Promise<boolean> {
    const cred = await offlineCredentialStorage.findByEmail(email);
    if (!cred) {
      set({ error: LOGIN_ERROR_MESSAGES.needsConnection, loading: false });
      return false;
    }

    const decision = evaluateOfflineLogin(cred, Date.now());
    if (!decision.allowed) {
      set({ error: offlineDeniedMessage(decision), loading: false });
      return false;
    }

    const matches = await verifyOfflinePassword(cred, password);
    if (!matches) {
      await offlineCredentialStorage.saveCredential(registerFailedAttempt(cred, Date.now()));
      set({ error: LOGIN_ERROR_MESSAGES.badCredentials, loading: false });
      return false;
    }

    await offlineCredentialStorage.saveCredential(registerSuccessfulLogin(cred, Date.now()));
    const token = await secureStorage.getTokenFor(cred.userId);
    await userStorage.saveUser(cred.profile);
    await secureStorage.setActiveUserId(cred.userId);

    set({ token, user: cred.profile, loading: false, error: null });
    // Sin token guardado, o vencido: la sesión local vale pero el servidor la
    // pedirá renovar al reconectar.
    applyServerState(token && !isTokenExpired(token) ? "unknown" : "reauth_required");
    return true;
  }

  return {
    token: null,
    user: null,
    serverState: "unknown",
    loading: false,
    error: null,
    isRestoring: true,

    restoreSession: async () => {
      set({ isRestoring: true });
      try {
        await secureStorage.migrateLegacyToken();

        const activeUserId = await secureStorage.getActiveUserId();
        if (!activeUserId) return;

        const [token, cachedUser] = await Promise.all([
          secureStorage.getTokenFor(activeUserId),
          userStorage.getUser(),
        ]);
        // Sin token o sin perfil no hay sesión que restaurar (spec 75: sin
        // `user` el AuthGuard igual llevaría a /login).
        if (!token || !cachedUser) return;

        set({ token, user: cachedUser });

        // Spec 86 (A): un token vencido NO cierra la sesión local. La app sigue
        // operando sin conexión; con red se pedirá renovar.
        if (isTokenExpired(token)) applyServerState("reauth_required");

        // Refresco best-effort en segundo plano; nunca condición para conservar
        // la sesión.
        apiMe()
          .then(async (freshUser) => {
            set({ user: freshUser });
            await userStorage.saveUser(freshUser);
            applyServerState("valid");
          })
          .catch(async (e) => {
            if (e instanceof AuthRequiredError) {
              await applyAuthFailure(e.kind, e.token);
              return;
            }
            if (e instanceof ServerError && e.status === 404) {
              await handleDeletedUser(activeUserId);
            }
            // Sin conexión, timeout o 5xx: la sesión local se conserva.
          });
      } catch {
        // Fallo inesperado leyendo el storage local — no se asume sesión válida,
        // pero tampoco se borra nada (la credencial y la cola siguen intactas).
        set({ token: null, user: null });
      } finally {
        set({ isRestoring: false });
      }
    },

    login: async (email, password) => {
      set({ loading: true, error: null });
      try {
        const { accessToken, user } = await apiLogin(email, password);
        await persistOnlineLogin(accessToken, user, password);
        set({ token: accessToken, user, loading: false });
        applyServerState("valid");
      } catch (e) {
        // Sin red, timeout, 5xx o 429: se intenta la verificación local.
        if (
          e instanceof NetworkError ||
          (e instanceof ServerError && (e.status >= 500 || e.status === 429))
        ) {
          await loginOffline(email, password);
          return;
        }

        // 401 con conexión: NUNCA cae a la verificación local (CA-13). Si la
        // contraseña coincide con el hash local, deducimos que cambió en el
        // servidor y se invalida la credencial.
        if (e instanceof ServerError && e.status === 401) {
          const cred = await offlineCredentialStorage.findByEmail(email);
          if (cred && (await verifyOfflinePassword(cred, password))) {
            await offlineCredentialStorage.markRequiresOnlineLogin(cred.userId);
            set({ error: LOGIN_ERROR_MESSAGES.passwordChanged, loading: false });
            return;
          }
          set({ error: LOGIN_ERROR_MESSAGES.badCredentials, loading: false });
          return;
        }

        set({
          error: e instanceof Error ? e.message : "Error al iniciar sesión",
          loading: false,
        });
      }
    },

    reauthenticate: async (password) => {
      const user = get().user;
      if (!user) return;
      set({ loading: true, error: null });
      try {
        const { accessToken, user: freshUser } = await apiLogin(user.email, password);
        await persistOnlineLogin(accessToken, freshUser, password);
        set({ token: accessToken, user: freshUser, loading: false });
        applyServerState("valid");
        // La cola del usuario se sincroniza sola; el estado de navegación no cambia.
        void SyncQueueService.processAll();
      } catch (e) {
        set({
          error:
            e instanceof ServerError && e.status === 401
              ? LOGIN_ERROR_MESSAGES.badCredentials
              : e instanceof Error
                ? e.message
                : "No se pudo renovar la sesión",
          loading: false,
        });
      }
    },

    switchUser: async () => {
      // Conserva token, credencial, perfil en el selector y cola.
      await clearActiveSession();
      set({ token: null, user: null, error: null, serverState: "unknown" });
      useSyncStatusStore.getState().setAuthBlocked(false);
    },

    forgetDevice: async () => {
      const userId = get().user?.userId;
      if (userId) {
        await secureStorage.deleteTokenFor(userId);
        await offlineCredentialStorage.deleteCredential(userId);
        await offlineCredentialStorage.removeKnownUser(userId);
      }
      await clearActiveSession();
      set({ token: null, user: null, error: null, serverState: "unknown" });
      useSyncStatusStore.getState().setAuthBlocked(false);
    },

    enableOfflineLogin: async (password) => {
      const user = get().user;
      if (!user) return;
      set({ loading: true, error: null });
      try {
        // Verifica la contraseña contra el servidor antes de guardar su hash.
        const { accessToken, user: freshUser } = await apiLogin(user.email, password);
        await persistOnlineLogin(accessToken, freshUser, password);
        set({ token: accessToken, user: freshUser, loading: false });
        applyServerState("valid");
      } catch (e) {
        set({
          error:
            e instanceof ServerError && e.status === 401
              ? LOGIN_ERROR_MESSAGES.badCredentials
              : e instanceof Error
                ? e.message
                : "No se pudo habilitar el ingreso sin conexión",
          loading: false,
        });
      }
    },

    clearError: () => set({ error: null }),
  };
});
