/**
 * Spec 75 — Recuperación de sesión sin conexión al reabrir la app.
 *
 * Cubre los criterios de aceptación de
 * `spec/75_recuperacion_sesion_sin_conexion.md`.
 *
 * ARRANCA EN ROJO: `src/lib/jwt.ts` y `src/storage/userStorage.ts` todavía no
 * existen (Fase 2); `useAuthStore.restoreSession()` todavía no distingue
 * NetworkError/ServerError 401/ServerError 5xx (Fase 3).
 *
 * Contexto del bug: `restoreSession()` depende de `GET /api/auth/me` para
 * decidir si la sesión sigue viva y borra el token ante cualquier error del
 * catch desnudo — incluida la simple ausencia de conexión. Estos casos fijan
 * el contrato de la validación local de expiración del JWT y de las cuatro
 * ramas que debe distinguir `restoreSession()`.
 */

jest.mock('../storage/secureStorage', () => ({
  secureStorage: {
    getToken: jest.fn(),
    saveToken: jest.fn(),
    deleteToken: jest.fn(),
  },
}));

jest.mock('../storage/userStorage', () => ({
  userStorage: {
    getUser: jest.fn(),
    saveUser: jest.fn(),
    deleteUser: jest.fn(),
  },
}));

jest.mock('../api/auth', () => ({
  login: jest.fn(),
  me: jest.fn(),
}));

import { secureStorage } from '../storage/secureStorage';
import { userStorage } from '../storage/userStorage';
import { me as apiMe, login as apiLogin } from '../api/auth';
import { NetworkError, ServerError } from '../api/httpClient';
import { useAuthStore } from '../store/useAuthStore';
import { getJwtExpiry, isTokenExpired } from '../lib/jwt';

const mockGetToken = secureStorage.getToken as jest.Mock;
const mockDeleteToken = secureStorage.deleteToken as jest.Mock;
const mockSaveToken = secureStorage.saveToken as jest.Mock;
const mockGetUser = userStorage.getUser as jest.Mock;
const mockSaveUser = userStorage.saveUser as jest.Mock;
const mockDeleteUser = userStorage.deleteUser as jest.Mock;
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

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleteToken.mockResolvedValue(undefined);
  mockDeleteUser.mockResolvedValue(undefined);
  mockSaveToken.mockResolvedValue(undefined);
  mockSaveUser.mockResolvedValue(undefined);
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
    mockGetToken.mockResolvedValue(VALID_TOKEN);
    mockGetUser.mockResolvedValue(CACHED_USER);
    mockApiMe.mockRejectedValue(new NetworkError());

    await useAuthStore.getState().restoreSession();

    const state = useAuthStore.getState();
    expect(state.token).toBe(VALID_TOKEN);
    expect(state.user).toEqual(CACHED_USER);
    expect(mockDeleteToken).not.toHaveBeenCalled();
    expect(state.isRestoring).toBe(false);
  });
});

describe('spec75 / useAuthStore.restoreSession — Criterio: token realmente vencido', () => {
  it('borra token y user, deja la sesión sin restaurar', async () => {
    mockGetToken.mockResolvedValue(EXPIRED_TOKEN);
    mockGetUser.mockResolvedValue(CACHED_USER);

    await useAuthStore.getState().restoreSession();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(mockDeleteToken).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
    // No debe intentar validar contra el backend un token ya vencido localmente.
    expect(mockApiMe).not.toHaveBeenCalled();
  });
});

describe('spec75 / useAuthStore.restoreSession — Criterio: 401 real del backend', () => {
  it('borra token y user cuando apiMe() responde 401', async () => {
    mockGetToken.mockResolvedValue(VALID_TOKEN);
    mockGetUser.mockResolvedValue(CACHED_USER);
    mockApiMe.mockRejectedValue(new ServerError(401, 'Unauthorized'));

    await useAuthStore.getState().restoreSession();

    // La restauración local ocurre primero; la limpieza por 401 es asíncrona
    // (best-effort en segundo plano) — se espera a que se resuelva.
    await new Promise((r) => setTimeout(r, 0));

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(mockDeleteToken).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
  });
});

describe('spec75 / useAuthStore.restoreSession — Criterio: usuario borrado (404 del backend)', () => {
  it('borra token y user cuando apiMe() responde 404 (TC-075-03, hallazgo de la ronda manual)', async () => {
    mockGetToken.mockResolvedValue(VALID_TOKEN);
    mockGetUser.mockResolvedValue(CACHED_USER);
    mockApiMe.mockRejectedValue(new ServerError(404, 'User not found'));

    await useAuthStore.getState().restoreSession();
    await new Promise((r) => setTimeout(r, 0));

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(mockDeleteToken).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
  });
});

describe('spec75 / useAuthStore.restoreSession — Criterio: backend caído (5xx/timeout)', () => {
  it('conserva la sesión restaurada localmente ante un ServerError 5xx', async () => {
    mockGetToken.mockResolvedValue(VALID_TOKEN);
    mockGetUser.mockResolvedValue(CACHED_USER);
    mockApiMe.mockRejectedValue(new ServerError(503, 'Service unavailable'));

    await useAuthStore.getState().restoreSession();
    await new Promise((r) => setTimeout(r, 0));

    const state = useAuthStore.getState();
    expect(state.token).toBe(VALID_TOKEN);
    expect(state.user).toEqual(CACHED_USER);
    expect(mockDeleteToken).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});

describe('spec75 / useAuthStore.login — persiste user localmente', () => {
  it('guarda el user en userStorage además del token en secureStorage', async () => {
    mockApiLogin.mockResolvedValue({ accessToken: VALID_TOKEN, user: CACHED_USER });

    await useAuthStore.getState().login('maria@sosagro.test', 'secret');

    expect(mockSaveToken).toHaveBeenCalledWith(VALID_TOKEN);
    expect(mockSaveUser).toHaveBeenCalledWith(CACHED_USER);
  });
});

describe('spec75 / useAuthStore.logout — limpia user cacheado', () => {
  it('borra tanto el token como el user cacheado', async () => {
    await useAuthStore.getState().logout();

    expect(mockDeleteToken).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
  });
});
