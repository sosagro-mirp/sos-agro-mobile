/**
 * Spec 86 — Sesión persistente en tablets compartidas sin conexión.
 * Manejo del 401/429 en HTTP y sync, y sync agrupada por dueño (D2-D6).
 *
 * Cubre CA-2, CA-5, CA-7, CA-15, CA-16 y CA-17 de
 * `spec/86_sesion_persistente_tablets_compartidas.md`.
 *
 * ARRANCA EN ROJO: `AuthRequiredError`, `opts.authToken` y la hora del
 * servidor en `ServerError` no existen en `httpClient.ts` (Fase 1);
 * `src/lib/authFailure.ts`, `src/lib/syncErrorAction.ts`,
 * `src/lib/authEvents.ts` y `src/lib/planOwnerSync.ts` no existen
 * (Fases 1 y 5); `useSyncStatusStore` no tiene `authBlocked` (Fase 3).
 *
 * Los casos de integración sobre `SyncQueueService` y `MediaUploadService`
 * (401 → `resetInFlightToRetryById`, sin `markFailedValidation`) se agregan a
 * sus suites existentes una vez autorizada su modificación (Fase 0).
 */

jest.mock('../storage/secureStorage', () => ({
  secureStorage: {
    getToken: jest.fn(),
  },
}));

jest.mock('../storage/syncQueue', () => ({ syncQueueStorage: {} }));
jest.mock('../storage/mediaUploadQueueStorage', () => ({ mediaUploadQueueStorage: {} }));

import { secureStorage } from '../storage/secureStorage';
import { httpClient, NetworkError, ServerError, AuthRequiredError } from '../api/httpClient';
import { classifyAuthFailure } from '../lib/authFailure';
import { resolveSyncErrorAction } from '../lib/syncErrorAction';
import { authEvents } from '../lib/authEvents';
import { planOwnerSync } from '../lib/planOwnerSync';
import { useSyncStatusStore } from '../store/useSyncStatusStore';

const mockGetToken = secureStorage.getToken as jest.Mock;

function fakeJwt(sub: string, expSeconds: number): string {
  const b64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub, exp: expSeconds })}.sig`;
}

const NOW_MS = Date.now();
const NOW_S = Math.floor(NOW_MS / 1000);
const TOKEN_A = fakeJwt('user-a', NOW_S - 60); // vencido hace 1 min
const TOKEN_B = fakeJwt('user-b', NOW_S + 3600); // vigente

function mockFetchResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
  useSyncStatusStore.setState({ reachability: 'online', isOnline: true, authBlocked: false });
});

describe('spec86 / D2, CA-5 — classifyAuthFailure según la hora del servidor', () => {
  it('exp anterior a la hora del servidor → expired', () => {
    expect(classifyAuthFailure(TOKEN_A, NOW_MS)).toBe('expired');
  });

  it('exp posterior a la hora del servidor → rejected (firma inválida)', () => {
    expect(classifyAuthFailure(TOKEN_B, NOW_MS)).toBe('rejected');
  });

  it('tablet con reloj atrasado: el servidor dice vencido aunque el reloj local no', () => {
    const tokenVigenteSegunTablet = fakeJwt('user-a', NOW_S + 600);
    const serverDate = NOW_MS + 3600 * 1000; // el servidor va 1 h adelante
    expect(classifyAuthFailure(tokenVigenteSegunTablet, serverDate)).toBe('expired');
  });

  it('sin cabecera Date usa la hora del dispositivo', () => {
    expect(classifyAuthFailure(TOKEN_A, null)).toBe('expired');
    expect(classifyAuthFailure(TOKEN_B, null)).toBe('rejected');
  });

  it('un token malformado se trata como rejected', () => {
    expect(classifyAuthFailure('no-es-jwt', NOW_MS)).toBe('rejected');
  });
});

describe('spec86 / D4 — httpClient: AuthRequiredError y token explícito', () => {
  it('un 401 de un request con token produce AuthRequiredError con la hora del servidor', async () => {
    mockGetToken.mockResolvedValue(TOKEN_B);
    const serverDate = new Date(NOW_MS).toUTCString();
    mockFetchResponse(401, { message: 'Unauthorized' }, { Date: serverDate });

    const err = await httpClient.get('/api/campaigns').catch((e) => e);

    expect(err).toBeInstanceOf(AuthRequiredError);
    expect(err).toBeInstanceOf(ServerError);
    expect(err.status).toBe(401);
    expect(err.serverDateMs).toBe(Date.parse(serverDate));
  });

  it('un 401 sin token (login) sigue siendo un ServerError normal', async () => {
    mockGetToken.mockResolvedValue(null);
    mockFetchResponse(401, { message: 'Invalid credentials' });

    const err = await httpClient.post('/api/auth/login', { email: 'x', password: 'y' }).catch((e) => e);

    expect(err).toBeInstanceOf(ServerError);
    expect(err).not.toBeInstanceOf(AuthRequiredError);
  });

  it('opts.authToken reemplaza al token de la sesión activa en la cabecera', async () => {
    mockGetToken.mockResolvedValue(TOKEN_B);
    mockFetchResponse(200, { ok: true });

    await httpClient.post('/api/surveys', { a: 1 }, { authToken: TOKEN_A });

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect((options.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN_A}`);
  });

  it('un 401 con token emite un evento de autenticación', async () => {
    const listener = jest.fn();
    const unsubscribe = authEvents.subscribe(listener);
    mockGetToken.mockResolvedValue(TOKEN_A);
    mockFetchResponse(401, {}, { Date: new Date(NOW_MS).toUTCString() });

    await httpClient.get('/api/auth/me').catch(() => undefined);
    unsubscribe();

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ token: TOKEN_A, kind: 'expired' }));
  });
});

describe('spec86 / D5, CA-7 — resolveSyncErrorAction', () => {
  it('NetworkError → network', () => {
    expect(resolveSyncErrorAction(new NetworkError())).toBe('network');
  });

  it('AuthRequiredError (401) → retry_auth, nunca failed_validation', () => {
    const err = new AuthRequiredError({ kind: 'expired', token: TOKEN_A, serverDateMs: NOW_MS });
    expect(resolveSyncErrorAction(err)).toBe('retry_auth');
  });

  it('429 → retry_transient', () => {
    expect(resolveSyncErrorAction(new ServerError(429, 'Too Many Requests'))).toBe('retry_transient');
  });

  it('403 y 422 siguen en failed_validation', () => {
    expect(resolveSyncErrorAction(new ServerError(403, 'Forbidden'))).toBe('failed_validation');
    expect(resolveSyncErrorAction(new ServerError(422, 'Unprocessable'))).toBe('failed_validation');
  });
});

describe('spec86 / D6, CA-15/16/17 — planOwnerSync', () => {
  it('cada dueño se procesa con su propio token', () => {
    const plan = planOwnerSync({
      owners: ['user-a', 'user-b'],
      tokens: { 'user-a': TOKEN_A, 'user-b': TOKEN_B },
      reauthRequired: new Set(),
      activeUserId: 'user-b',
    });
    expect(plan.toProcess).toEqual([
      { ownerUserId: 'user-a', token: TOKEN_A },
      { ownerUserId: 'user-b', token: TOKEN_B },
    ]);
    expect(plan.waiting).toEqual([]);
  });

  it('un dueño sin token o con renovación pendiente espera y no bloquea a los demás', () => {
    const plan = planOwnerSync({
      owners: ['user-a', 'user-b', 'user-c'],
      tokens: { 'user-a': TOKEN_A, 'user-b': TOKEN_B, 'user-c': null },
      reauthRequired: new Set(['user-a']),
      activeUserId: 'user-b',
    });
    expect(plan.toProcess).toEqual([{ ownerUserId: 'user-b', token: TOKEN_B }]);
    expect(plan.waiting.sort()).toEqual(['user-a', 'user-c']);
  });

  it('registros sin dueño (anteriores a la migración) usan el token de la sesión activa', () => {
    const plan = planOwnerSync({
      owners: [null],
      tokens: { 'user-b': TOKEN_B },
      reauthRequired: new Set(),
      activeUserId: 'user-b',
    });
    expect(plan.toProcess).toEqual([{ ownerUserId: null, token: TOKEN_B }]);
  });

  it('sin ningún token usable no se procesa nada (bug de sync sin sesión)', () => {
    const plan = planOwnerSync({
      owners: ['user-a', null],
      tokens: {},
      reauthRequired: new Set(),
      activeUserId: null,
    });
    expect(plan.toProcess).toEqual([]);
  });
});

describe('spec86 / D3, CA-2 — authBlocked apaga isOnline sin tocar reachability', () => {
  it('con authBlocked, isOnline es false aunque haya red', () => {
    useSyncStatusStore.getState().setAuthBlocked(true);
    const s = useSyncStatusStore.getState();
    expect(s.isOnline).toBe(false);
    expect(s.reachability).toBe('online');
  });

  it('un cambio de reachability no reactiva isOnline mientras siga authBlocked', () => {
    useSyncStatusStore.getState().setAuthBlocked(true);
    useSyncStatusStore.getState().setReachability('online');
    expect(useSyncStatusStore.getState().isOnline).toBe(false);
  });

  it('al renovar la sesión, isOnline vuelve a depender solo de la red', () => {
    useSyncStatusStore.getState().setAuthBlocked(true);
    useSyncStatusStore.getState().setAuthBlocked(false);
    expect(useSyncStatusStore.getState().isOnline).toBe(true);
  });
});
