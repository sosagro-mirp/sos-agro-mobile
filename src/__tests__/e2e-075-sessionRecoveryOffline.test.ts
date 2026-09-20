/**
 * Spec 75 — Recuperación de sesión sin conexión al reabrir la app.
 *
 * Cubre los criterios de aceptación de
 * `spec/75_recuperacion_sesion_sin_conexion.md`.
 *
 * Actualizado por el spec 86 (autorizado por el usuario, 2026-09-20): el token
 * ya no es único sino por usuario (`secureStorage.getActiveUserId/getTokenFor…`)
 * y un token vencido dejó de cerrar la sesión local — el criterio "token
 * vencido → login" del spec 75 quedó REEMPLAZADO por `e2e-086-authSessionDecoupling`
 * (la sesión se conserva y pasa a `reauth_required`). Los demás criterios del
 * spec 75 (token vigente offline, 401, 404, 5xx, persistencia del `user`) se
 * conservan aquí sobre la nueva API de almacenamiento.
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
  },
}));

jest.mock('../lib/offlineCredential', () => ({
  ...jest.requireActual('../lib/offlineCredential'),
  createOfflineCredential: jest.fn().mockResolvedValue({}),
}));

jest.mock('../api/auth', () => ({
  login: jest.fn(),
  me: jest.fn(),
}));

jest.mock('../sync/SyncQueueService', () => ({ SyncQueueService: { processAll: jest.fn() } }));
jest.mock('../store/useCampaignSessionStore', () => ({
  useCampaignSessionStore: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock('../store/useInstrumentSurveyStore', () => ({
  useInstrumentSurveyStore: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock('../storage/syncQueue', () => ({ syncQueueStorage: {} }));
jest.mock('../storage/mediaUploadQueueStorage', () => ({ mediaUploadQueueStorage: {} }));

import { secureStorage } from '../storage/secureStorage';
import { userStorage } from '../storage/userStorage';
import { me as apiMe, login as apiLogin } from '../api/auth';
import { NetworkError, ServerError } from '../api/httpClient';
import { useAuthStore } from '../store/useAuthStore';
import { getJwtExpiry, isTokenExpired } from '../lib/jwt';

const ss = secureStorage as unknown as Record<string, jest.Mock>;
const us = userStorage as unknown as Record<string, jest.Mock>;
const mockApiMe = apiMe as jest.Mock;
const mockApiLogin = apiLogin as jest.Mock;

const CACHED_USER = {
  userId: 'a3f1c9d2-0000-4000-8000-000000000001',
  name: 'María Restrepo',
  lastName: '',
  email: 'maria@sosagro.test',
  role: 'pollster',
  mustChangePassword: false,
};

/** Construye un JWT sintético (header.payload.signature) con el `exp` dado. */
function fakeJwt(expSeconds: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: CACHED_USER.userId, exp: expSeconds };
  const b64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url(header)}.${b64url(payload)}.fakesignature`;
}

const NOW_SECONDS = Math.floor(Date.now() / 1000);
const VALID_TOKEN = fakeJwt(NOW_SECONDS + 60 * 60); // vence en 1h
const EXPIRED_TOKEN = fakeJwt(NOW_SECONDS - 60 * 60); // venció hace 1h

function storedSession(token: string) {
  ss.getActiveUserId.mockResolvedValue(CACHED_USER.userId);
  ss.getTokenFor.mockResolvedValue(token);
  us.getUser.mockResolvedValue(CACHED_USER);
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of [...Object.values(ss), ...Object.values(us)]) m.mockResolvedValue(undefined);
  ss.migrateLegacyToken.mockResolvedValue(null);
  mockApiMe.mockReset();
  mockApiMe.mockRejectedValue(new NetworkError());
  useAuthStore.setState({ token: null, user: null, serverState: 'unknown', error: null });
});

describe('spec75 / jwt.ts — validación local de expiración', () => {
  it('getJwtExpiry devuelve el exp en milisegundos', () => {
    expect(getJwtExpiry(VALID_TOKEN)).toBe((NOW_SECONDS + 60 * 60) * 1000);
  });

  it('getJwtExpiry devuelve null ante un token malformado', () => {
    expect(getJwtExpiry('no-es-un-jwt')).toBeNull();
    expect(getJwtExpiry('')).toBeNull();
  });

  it('isTokenExpired es false para un token vigente', () => {
    expect(isTokenExpired(VALID_TOKEN)).toBe(false);
  });

  it('isTokenExpired es true para un token vencido', () => {
    expect(isTokenExpired(EXPIRED_TOKEN)).toBe(true);
  });

  it('isTokenExpired es true ante un token malformado (no se asume válido)', () => {
    expect(isTokenExpired('no-es-un-jwt')).toBe(true);
  });
});

describe('spec75 / useAuthStore.restoreSession — Criterio: reapertura sin conexión, token vigente', () => {
  it('restaura token y user cacheados sin depender de apiMe()', async () => {
    storedSession(VALID_TOKEN);
    mockApiMe.mockRejectedValue(new NetworkError());

    await useAuthStore.getState().restoreSession();

    const state = useAuthStore.getState();
    expect(state.token).toBe(VALID_TOKEN);
    expect(state.user).toEqual(CACHED_USER);
    expect(ss.deleteTokenFor).not.toHaveBeenCalled();
    expect(state.isRestoring).toBe(false);
  });
});

describe('spec75 / useAuthStore.restoreSession — Criterio: token vencido (reemplazado por spec 86)', () => {
  it('ya NO borra la sesión: la conserva y queda por renovar con el servidor', async () => {
    storedSession(EXPIRED_TOKEN);

    await useAuthStore.getState().restoreSession();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(CACHED_USER);
    expect(state.serverState).toBe('reauth_required');
    expect(ss.deleteTokenFor).not.toHaveBeenCalled();
    expect(us.deleteUser).not.toHaveBeenCalled();
  });
});

describe('spec75 / useAuthStore.restoreSession — Criterio: usuario borrado (404 del backend)', () => {
  it('cierra la sesión y borra el token del usuario cuando apiMe() responde 404 (TC-075-03)', async () => {
    storedSession(VALID_TOKEN);
    mockApiMe.mockRejectedValue(new ServerError(404, 'User not found'));

    await useAuthStore.getState().restoreSession();
    await new Promise((r) => setTimeout(r, 0));

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(ss.deleteTokenFor).toHaveBeenCalledWith(CACHED_USER.userId);
  });
});

describe('spec75 / useAuthStore.restoreSession — Criterio: backend caído (5xx/timeout)', () => {
  it('conserva la sesión restaurada localmente ante un ServerError 5xx', async () => {
    storedSession(VALID_TOKEN);
    mockApiMe.mockRejectedValue(new ServerError(503, 'Service unavailable'));

    await useAuthStore.getState().restoreSession();
    await new Promise((r) => setTimeout(r, 0));

    const state = useAuthStore.getState();
    expect(state.token).toBe(VALID_TOKEN);
    expect(state.user).toEqual(CACHED_USER);
    expect(ss.deleteTokenFor).not.toHaveBeenCalled();
    expect(us.deleteUser).not.toHaveBeenCalled();
  });
});

describe('spec75 / useAuthStore.login — persiste user localmente', () => {
  it('guarda el user en userStorage además del token por usuario en secureStorage', async () => {
    mockApiLogin.mockResolvedValue({ accessToken: VALID_TOKEN, user: CACHED_USER });

    await useAuthStore.getState().login('maria@sosagro.test', 'secret');

    expect(ss.saveTokenFor).toHaveBeenCalledWith(CACHED_USER.userId, VALID_TOKEN);
    expect(us.saveUser).toHaveBeenCalledWith(CACHED_USER);
  });
});

// El 401 "rechazado" (firma inválida) y `logout()` (ahora `switchUser()` /
// `forgetDevice()`) quedan cubiertos en `e2e-086-authSessionDecoupling`.
