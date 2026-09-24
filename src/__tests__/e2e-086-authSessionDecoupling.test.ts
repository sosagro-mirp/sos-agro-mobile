/**
 * Spec 86 — Sesión persistente en tablets compartidas sin conexión.
 * Sesión local desacoplada del token (estrategia A), ingreso sin conexión
 * (C) y acciones de cuenta (D) en `useAuthStore`.
 *
 * Cubre CA-1, CA-3, CA-4, CA-6, CA-8, CA-9, CA-12, CA-13 y CA-21/22 de
 * `spec/86_sesion_persistente_tablets_compartidas.md`.
 *
 * ARRANCA EN ROJO: `useAuthStore` todavía no tiene `serverState`,
 * `reauthenticate`, `switchUser` ni `forgetDevice`, y sigue borrando la sesión
 * ante un token vencido (Fase 3). `secureStorage` no tiene tokens por usuario
 * (Fase 1) y `offlineCredentialStorage` no existe (Fase 2).
 *
 * Nota: el caso de `e2e-075-sessionRecoveryOffline.test.ts` "token realmente
 * vencido → borra la sesión" queda reemplazado por el primer caso de este
 * archivo. Su ajuste requiere autorización del usuario (Fase 0).
 */

jest.mock('../storage/secureStorage', () => ({
  secureStorage: {
    migrateLegacyToken: jest.fn(),
    getActiveUserId: jest.fn(),
    setActiveUserId: jest.fn(),
    clearActiveUserId: jest.fn(),
    getTokenFor: jest.fn(),
    saveTokenFor: jest.fn(),
    deleteTokenFor: jest.fn(),
    getToken: jest.fn(),
  },
}));

jest.mock('../storage/userStorage', () => ({
  userStorage: {
    getUser: jest.fn(),
    saveUser: jest.fn(),
    deleteUser: jest.fn(),
  },
}));

jest.mock('../storage/offlineCredentialStorage', () => ({
  offlineCredentialStorage: {
    getCredential: jest.fn(),
    findByEmail: jest.fn(),
    saveCredential: jest.fn(),
    deleteCredential: jest.fn(),
    markRequiresOnlineLogin: jest.fn(),
    upsertKnownUser: jest.fn(),
    removeKnownUser: jest.fn(),
    listKnownUsers: jest.fn(),
    evictExcess: jest.fn(),
  },
}));

jest.mock('../lib/offlineCredential', () => {
  const actual = jest.requireActual('../lib/offlineCredential');
  return {
    ...actual,
    createOfflineCredential: jest.fn(),
    verifyOfflinePassword: jest.fn(),
  };
});

jest.mock('../api/auth', () => ({
  login: jest.fn(),
  me: jest.fn(),
}));

const mockProcessAll = jest.fn();
jest.mock('../sync/SyncQueueService', () => ({
  SyncQueueService: { processAll: (...args: unknown[]) => mockProcessAll(...args) },
}));

const mockResetSession = jest.fn();
const mockResetSurvey = jest.fn();
jest.mock('../store/useCampaignSessionStore', () => ({
  useCampaignSessionStore: { getState: () => ({ reset: mockResetSession }) },
}));
jest.mock('../store/useInstrumentSurveyStore', () => ({
  useInstrumentSurveyStore: { getState: () => ({ reset: mockResetSurvey }) },
}));

jest.mock('../storage/syncQueue', () => ({
  syncQueueStorage: { listPendingOwners: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../storage/mediaUploadQueueStorage', () => ({ mediaUploadQueueStorage: {} }));

import { secureStorage } from '../storage/secureStorage';
import { userStorage } from '../storage/userStorage';
import { offlineCredentialStorage } from '../storage/offlineCredentialStorage';
import { createOfflineCredential, verifyOfflinePassword } from '../lib/offlineCredential';
import { me as apiMe, login as apiLogin } from '../api/auth';
import { NetworkError, ServerError, AuthRequiredError } from '../api/httpClient';
import { useAuthStore } from '../store/useAuthStore';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { syncQueueStorage } from '../storage/syncQueue';

const ss = secureStorage as unknown as Record<string, jest.Mock>;
const us = userStorage as unknown as Record<string, jest.Mock>;
const ocs = offlineCredentialStorage as unknown as Record<string, jest.Mock>;
const mockCreateCred = createOfflineCredential as jest.Mock;
const mockVerify = verifyOfflinePassword as jest.Mock;
const mockApiMe = apiMe as jest.Mock;
const mockApiLogin = apiLogin as jest.Mock;

const USER_A = {
  userId: 'a3f1c9d2-0000-4000-8000-00000000000a',
  name: 'Ana',
  lastName: 'Pérez',
  email: 'ana@sosagro.test',
  role: 'pollster',
  mustChangePassword: false,
};
const PASSWORD = 'CampoSinSenal!2026';

function fakeJwt(expSeconds: number): string {
  const b64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: USER_A.userId, exp: expSeconds })}.sig`;
}

const NOW_MS = Date.now();
const NOW_S = Math.floor(NOW_MS / 1000);
const VALID_TOKEN = fakeJwt(NOW_S + 3600);
const EXPIRED_TOKEN = fakeJwt(NOW_S - 3600);
const NEW_TOKEN = fakeJwt(NOW_S + 7 * 24 * 3600);

const STORED_CRED = {
  version: 1,
  userId: USER_A.userId,
  email: USER_A.email,
  algorithm: 'pbkdf2-sha256',
  iterations: 1000,
  salt: 'c2FsdA',
  hash: 'aGFzaA',
  lastOnlineLoginAt: NOW_MS - 24 * 3600 * 1000,
  maxSeenAt: NOW_MS - 24 * 3600 * 1000,
  failedAttempts: 0,
  lockedUntil: null,
  requiresOnlineLogin: false,
  profile: USER_A,
};

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of [...Object.values(ss), ...Object.values(us), ...Object.values(ocs)]) {
    m.mockResolvedValue(undefined);
  }
  ss.migrateLegacyToken.mockResolvedValue(null);
  // Por defecto /me falla por red: la restauración local no depende de él.
  mockApiMe.mockReset();
  mockApiMe.mockRejectedValue(new NetworkError());
  mockCreateCred.mockResolvedValue(STORED_CRED);
  ocs.evictExcess.mockResolvedValue([]);
  (syncQueueStorage.listPendingOwners as jest.Mock).mockResolvedValue([]);
  useAuthStore.setState({ token: null, user: null, serverState: 'unknown', error: null });
  useSyncStatusStore.setState({ reachability: 'online', isOnline: true, authBlocked: false });
});

function activeSession(token: string) {
  ss.getActiveUserId.mockResolvedValue(USER_A.userId);
  ss.getTokenFor.mockResolvedValue(token);
  us.getUser.mockResolvedValue(USER_A);
}

describe('spec86 / CA-1 — token vencido no cierra la sesión local', () => {
  it('restaura user y marca reauth_required sin borrar nada (reemplaza e2e-075 "token vencido")', async () => {
    activeSession(EXPIRED_TOKEN);
    mockApiMe.mockRejectedValue(new NetworkError());

    await useAuthStore.getState().restoreSession();
    await flush();

    const s = useAuthStore.getState();
    expect(s.user).toEqual(USER_A);
    expect(s.serverState).toBe('reauth_required');
    expect(ss.deleteTokenFor).not.toHaveBeenCalled();
    expect(us.deleteUser).not.toHaveBeenCalled();
    expect(ocs.deleteCredential).not.toHaveBeenCalled();
    expect(useSyncStatusStore.getState().authBlocked).toBe(true);
  });

  it('migra la clave de token anterior una sola vez antes de leer la sesión', async () => {
    ss.getActiveUserId.mockResolvedValue(null);
    await useAuthStore.getState().restoreSession();
    expect(ss.migrateLegacyToken).toHaveBeenCalledTimes(1);
  });

  it('sin sesión activa queda en login', async () => {
    ss.getActiveUserId.mockResolvedValue(null);
    await useAuthStore.getState().restoreSession();
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('spec86 / D2 — respuesta de /me en segundo plano', () => {
  it('401 por vencimiento → reauth_required, sesión local intacta', async () => {
    activeSession(VALID_TOKEN);
    mockApiMe.mockRejectedValue(
      new AuthRequiredError({ kind: 'expired', token: VALID_TOKEN, serverDateMs: NOW_MS + 2 * 3600 * 1000 }),
    );

    await useAuthStore.getState().restoreSession();
    await flush();

    expect(useAuthStore.getState().user).toEqual(USER_A);
    expect(useAuthStore.getState().serverState).toBe('reauth_required');
  });

  it('CA-4: 401 por rechazo → cierra la sesión local y exige ingreso en línea', async () => {
    activeSession(VALID_TOKEN);
    mockApiMe.mockRejectedValue(
      new AuthRequiredError({ kind: 'rejected', token: VALID_TOKEN, serverDateMs: NOW_MS }),
    );

    await useAuthStore.getState().restoreSession();
    await flush();

    expect(useAuthStore.getState().user).toBeNull();
    expect(ss.clearActiveUserId).toHaveBeenCalled();
    expect(ocs.markRequiresOnlineLogin).toHaveBeenCalledWith(USER_A.userId);
    expect(ocs.deleteCredential).not.toHaveBeenCalled();
  });

  it('CA-6: 404 → cierra sesión y olvida al usuario en esta tablet', async () => {
    activeSession(VALID_TOKEN);
    mockApiMe.mockRejectedValue(new ServerError(404, 'User not found'));

    await useAuthStore.getState().restoreSession();
    await flush();

    expect(useAuthStore.getState().user).toBeNull();
    expect(ss.deleteTokenFor).toHaveBeenCalledWith(USER_A.userId);
    expect(ocs.deleteCredential).toHaveBeenCalledWith(USER_A.userId);
    expect(ocs.removeKnownUser).toHaveBeenCalledWith(USER_A.userId);
  });

  it('5xx o sin red → nada cambia', async () => {
    activeSession(VALID_TOKEN);
    mockApiMe.mockRejectedValue(new ServerError(503, 'Unavailable'));

    await useAuthStore.getState().restoreSession();
    await flush();

    expect(useAuthStore.getState().user).toEqual(USER_A);
    expect(useAuthStore.getState().serverState).not.toBe('reauth_required');
    expect(ss.clearActiveUserId).not.toHaveBeenCalled();
  });
});

describe('spec86 / CA-8 — login en línea habilita el ingreso sin conexión', () => {
  it('guarda token por usuario, sesión activa, credencial y usuario conocido', async () => {
    mockApiLogin.mockResolvedValue({ accessToken: NEW_TOKEN, user: USER_A });

    await useAuthStore.getState().login(USER_A.email, PASSWORD);

    expect(ss.saveTokenFor).toHaveBeenCalledWith(USER_A.userId, NEW_TOKEN);
    expect(ss.setActiveUserId).toHaveBeenCalledWith(USER_A.userId);
    expect(mockCreateCred).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A.userId, password: PASSWORD }),
    );
    expect(ocs.saveCredential).toHaveBeenCalledWith(STORED_CRED);
    expect(ocs.upsertKnownUser).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_A.userId }));
    expect(useAuthStore.getState().serverState).toBe('valid');
  });
});

describe('spec86 / D7 (M1) — máximo 10 usuarios por tablet', () => {
  it('tras un login en línea retira a los excedentes y borra sus tokens, protegiendo a quien tiene cola y a quien ingresa', async () => {
    mockApiLogin.mockResolvedValue({ accessToken: NEW_TOKEN, user: USER_A });
    (syncQueueStorage.listPendingOwners as jest.Mock).mockResolvedValue(['user-with-queue', null]);
    ocs.evictExcess.mockResolvedValue(['old-user-1', 'old-user-2']);

    await useAuthStore.getState().login(USER_A.email, PASSWORD);

    const protectedOwners = ocs.evictExcess.mock.calls[0][0] as Set<string>;
    expect(protectedOwners.has('user-with-queue')).toBe(true);
    expect(protectedOwners.has(USER_A.userId)).toBe(true);
    expect(ss.deleteTokenFor).toHaveBeenCalledWith('old-user-1');
    expect(ss.deleteTokenFor).toHaveBeenCalledWith('old-user-2');
  });

  it('un fallo en la limpieza no impide el ingreso', async () => {
    mockApiLogin.mockResolvedValue({ accessToken: NEW_TOKEN, user: USER_A });
    ocs.evictExcess.mockRejectedValue(new Error('storage busy'));

    await useAuthStore.getState().login(USER_A.email, PASSWORD);

    expect(useAuthStore.getState().user).toEqual(USER_A);
  });
});

describe('spec86 / CA-9, CA-12 — login sin conexión', () => {
  it('sin red, un usuario conocido entra con su contraseña verificada localmente', async () => {
    mockApiLogin.mockRejectedValue(new NetworkError());
    ocs.findByEmail.mockResolvedValue(STORED_CRED);
    mockVerify.mockResolvedValue(true);

    await useAuthStore.getState().login(USER_A.email, PASSWORD);

    const s = useAuthStore.getState();
    expect(s.user).toEqual(USER_A);
    expect(s.error).toBeNull();
    expect(ss.setActiveUserId).toHaveBeenCalledWith(USER_A.userId);
  });

  it('también cae a la verificación local ante 429 o 5xx', async () => {
    mockApiLogin.mockRejectedValue(new ServerError(429, 'Too Many Requests'));
    ocs.findByEmail.mockResolvedValue(STORED_CRED);
    mockVerify.mockResolvedValue(true);

    await useAuthStore.getState().login(USER_A.email, PASSWORD);

    expect(useAuthStore.getState().user).toEqual(USER_A);
  });

  it('una contraseña equivocada sin red muestra error y registra el intento', async () => {
    mockApiLogin.mockRejectedValue(new NetworkError());
    ocs.findByEmail.mockResolvedValue(STORED_CRED);
    mockVerify.mockResolvedValue(false);

    await useAuthStore.getState().login(USER_A.email, 'mala');

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().error).toBeTruthy();
    expect(ocs.saveCredential).toHaveBeenCalledWith(expect.objectContaining({ failedAttempts: 1 }));
  });

  it('un usuario que nunca ingresó en la tablet no puede entrar sin red', async () => {
    mockApiLogin.mockRejectedValue(new NetworkError());
    ocs.findByEmail.mockResolvedValue(null);

    await useAuthStore.getState().login('nuevo@sosagro.test', PASSWORD);

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().error).toMatch(/conexi[oó]n/i);
    expect(useAuthStore.getState().error).not.toMatch(/incorrectos/i);
  });
});

describe('spec86 / CA-13 — contraseña cambiada en el servidor', () => {
  it('con red, un 401 del login nunca entra por la verificación local', async () => {
    mockApiLogin.mockRejectedValue(new ServerError(401, 'Invalid credentials'));
    ocs.findByEmail.mockResolvedValue(STORED_CRED);
    mockVerify.mockResolvedValue(true);

    await useAuthStore.getState().login(USER_A.email, PASSWORD);

    expect(useAuthStore.getState().user).toBeNull();
    expect(ss.setActiveUserId).not.toHaveBeenCalled();
  });

  it('si la contraseña coincide con el hash local, invalida la credencial y lo informa', async () => {
    mockApiLogin.mockRejectedValue(new ServerError(401, 'Invalid credentials'));
    ocs.findByEmail.mockResolvedValue(STORED_CRED);
    mockVerify.mockResolvedValue(true);

    await useAuthStore.getState().login(USER_A.email, PASSWORD);

    expect(ocs.markRequiresOnlineLogin).toHaveBeenCalledWith(USER_A.userId);
    expect(useAuthStore.getState().error).toMatch(/contrase[nñ]a cambi[oó]/i);
  });
});

describe('spec86 / CA-3 — renovar la sesión', () => {
  it('reauthenticate guarda el nuevo token, pasa a valid, libera authBlocked y sincroniza', async () => {
    activeSession(EXPIRED_TOKEN);
    await useAuthStore.getState().restoreSession();
    mockApiLogin.mockResolvedValue({ accessToken: NEW_TOKEN, user: USER_A });

    await useAuthStore.getState().reauthenticate(PASSWORD);

    expect(mockApiLogin).toHaveBeenCalledWith(USER_A.email, PASSWORD);
    expect(ss.saveTokenFor).toHaveBeenCalledWith(USER_A.userId, NEW_TOKEN);
    expect(useAuthStore.getState().serverState).toBe('valid');
    expect(useAuthStore.getState().user).toEqual(USER_A);
    expect(useSyncStatusStore.getState().authBlocked).toBe(false);
    expect(mockProcessAll).toHaveBeenCalled();
  });
});

describe('spec86 / CA-21 — cambiar de encuestador', () => {
  it('conserva token, credencial y cola; limpia la sesión activa y los stores de encuesta', async () => {
    activeSession(VALID_TOKEN);
    await useAuthStore.getState().restoreSession();

    await useAuthStore.getState().switchUser();

    expect(useAuthStore.getState().user).toBeNull();
    expect(ss.clearActiveUserId).toHaveBeenCalled();
    expect(ss.deleteTokenFor).not.toHaveBeenCalled();
    expect(ocs.deleteCredential).not.toHaveBeenCalled();
    expect(ocs.removeKnownUser).not.toHaveBeenCalled();
    expect(mockResetSession).toHaveBeenCalled();
    expect(mockResetSurvey).toHaveBeenCalled();
  });
});

describe('spec86 / CA-22 — olvidar esta tablet', () => {
  it('borra token, credencial y entrada del selector del usuario activo', async () => {
    activeSession(VALID_TOKEN);
    await useAuthStore.getState().restoreSession();

    await useAuthStore.getState().forgetDevice();

    expect(useAuthStore.getState().user).toBeNull();
    expect(ss.deleteTokenFor).toHaveBeenCalledWith(USER_A.userId);
    expect(ocs.deleteCredential).toHaveBeenCalledWith(USER_A.userId);
    expect(ocs.removeKnownUser).toHaveBeenCalledWith(USER_A.userId);
    expect(ss.clearActiveUserId).toHaveBeenCalled();
    expect(mockResetSession).toHaveBeenCalled();
  });
});
