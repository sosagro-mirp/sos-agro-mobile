/**
 * Tests for httpClient using MSW to intercept fetch calls.
 *
 * expo-secure-store is mocked to return null (no token), so requests go
 * out without an Authorization header.
 */

import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { httpClient, NetworkError, ServerError } from '../api/httpClient';
import { useSyncStatusStore } from '../store/useSyncStatusStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
}));

// httpClient reads EXPO_PUBLIC_API_BASE_URL at module load time.
// jest-expo sets NODE_ENV=test; we set the env var before import via
// the moduleNameMapper / moduleFactory pattern — but since the module is
// already imported above, we patch the URL by pointing MSW to the default.
const BASE = 'http://localhost:3000';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ─── GET ─────────────────────────────────────────────────────────────────────

describe('GET requests', () => {
  it('returns parsed JSON on 200', async () => {
    server.use(
      http.get(`${BASE}/api/ping`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );

    const result = await httpClient.get<{ ok: boolean }>('/api/ping');
    expect(result).toEqual({ ok: true });
  });

  it('returns undefined on 204 No Content', async () => {
    server.use(
      http.get(`${BASE}/api/no-content`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );

    const result = await httpClient.get('/api/no-content');
    expect(result).toBeUndefined();
  });
});

// ─── POST ────────────────────────────────────────────────────────────────────

describe('POST requests', () => {
  it('sends body and returns parsed JSON on 201', async () => {
    server.use(
      http.post(`${BASE}/api/items`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ id: 'new-id', ...body }, { status: 201 });
      }),
    );

    const result = await httpClient.post<{ id: string; name: string }>('/api/items', {
      name: 'test',
    });
    expect(result.id).toBe('new-id');
    expect(result.name).toBe('test');
  });
});

// ─── PATCH ───────────────────────────────────────────────────────────────────

describe('PATCH requests', () => {
  it('returns parsed JSON on 200', async () => {
    server.use(
      http.patch(`${BASE}/api/items/1`, () =>
        HttpResponse.json({ updated: true }),
      ),
    );

    const result = await httpClient.patch<{ updated: boolean }>('/api/items/1', {
      status: 'done',
    });
    expect(result).toEqual({ updated: true });
  });
});

// ─── 4xx errors — no retry ───────────────────────────────────────────────────

describe('4xx responses', () => {
  it('throws ServerError on 400 without retrying', async () => {
    let callCount = 0;
    server.use(
      http.post(`${BASE}/api/bad`, () => {
        callCount++;
        return HttpResponse.json({ message: 'Bad input' }, { status: 400 });
      }),
    );

    await expect(httpClient.post('/api/bad', {})).rejects.toMatchObject({
      name: 'ServerError',
      status: 400,
      message: 'Bad input',
    });
    expect(callCount).toBe(1); // no retries on 4xx
  });

  it('throws ServerError on 401', async () => {
    server.use(
      http.get(`${BASE}/api/protected`, () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    );

    await expect(httpClient.get('/api/protected')).rejects.toMatchObject({
      name: 'ServerError',
      status: 401,
    });
  });

  it('throws ServerError on 404', async () => {
    server.use(
      http.get(`${BASE}/api/missing`, () =>
        HttpResponse.json({ message: 'Not found' }, { status: 404 }),
      ),
    );

    await expect(httpClient.get('/api/missing')).rejects.toMatchObject({
      name: 'ServerError',
      status: 404,
    });
  });

  it('ServerError is not a NetworkError', async () => {
    server.use(
      http.get(`${BASE}/api/gone`, () =>
        new HttpResponse(null, { status: 410 }),
      ),
    );

    try {
      await httpClient.get('/api/gone');
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ServerError);
      expect(err).not.toBeInstanceOf(NetworkError);
    }
  });
});

// ─── 5xx errors — retry then throw ───────────────────────────────────────────

describe('5xx responses', () => {
  // Real exponential backoff (1s + 2s + 4s = 7s) runs during these tests —
  // jest fake timers aren't used because the delay lives inside the module
  // under test. Pass an explicit per-test timeout (3rd arg) rather than
  // jest.setTimeout() in beforeEach/afterEach: the latter only takes effect
  // for tests registered *after* it runs and leaks into later describe
  // blocks depending on execution order, which caused the "Network
  // failures"/"Timeout" tests below to intermittently inherit a 5s cap.
  it(
    'retries on 500 and throws ServerError after all retries are exhausted',
    async () => {
      let callCount = 0;
      server.use(
        http.get(`${BASE}/api/flaky`, () => {
          callCount++;
          return new HttpResponse(null, { status: 500 });
        }),
      );

      await expect(httpClient.get('/api/flaky')).rejects.toMatchObject({
        name: 'ServerError',
        status: 500,
      });
      // MAX_RETRIES=3, so initial attempt + 3 retries = 4 total
      expect(callCount).toBe(4);
    },
    15000,
  );

  it('succeeds if a 500 recovers before retries exhausted', async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE}/api/recovers`, () => {
        callCount++;
        if (callCount < 3) return new HttpResponse(null, { status: 500 });
        return HttpResponse.json({ recovered: true });
      }),
    );

    const result = await httpClient.get<{ recovered: boolean }>('/api/recovers');
    expect(result).toEqual({ recovered: true });
    expect(callCount).toBe(3);
  });
});

// ─── Network failures ─────────────────────────────────────────────────────────

describe('Network failures', () => {
  it('throws NetworkError when fetch rejects (connection refused)', async () => {
    // HttpResponse.error() is MSW's dedicated way to simulate a genuine
    // fetch-level rejection (e.g. connection refused). Throwing inside a
    // resolver is a different scenario — MSW surfaces it as a 500 response
    // instead, which would exercise the 5xx retry path, not this one.
    server.use(http.get(`${BASE}/api/unreachable`, () => HttpResponse.error()));

    await expect(httpClient.get('/api/unreachable')).rejects.toMatchObject({
      name: 'NetworkError',
    });
  });

  it('NetworkError is not a ServerError', async () => {
    server.use(http.get(`${BASE}/api/offline`, () => HttpResponse.error()));

    try {
      await httpClient.get('/api/offline');
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(NetworkError);
      expect(err).not.toBeInstanceOf(ServerError);
    }
  });

  // Spec 81 — corrección de un bug real encontrado en la ronda manual
  // (TC-081-003, 2026-08-29): una vez `reachability` caía en
  // 'server_unreachable', nada la devolvía a 'online' tras una respuesta
  // exitosa — el banner y el copy de error se quedaban diciendo "no pudimos
  // contactar el servidor" indefinidamente aunque el backend ya respondiera.
  it('recupera reachability tras un éxito, si estaba en server_unreachable', async () => {
    useSyncStatusStore.getState().setReachability('server_unreachable');
    server.use(http.get(`${BASE}/api/ping`, () => HttpResponse.json({ ok: true })));

    await httpClient.get('/api/ping');

    expect(useSyncStatusStore.getState().reachability).toBe('online');
  });

  it('no toca reachability cuando ya estaba en online', async () => {
    useSyncStatusStore.getState().setReachability('online');
    server.use(http.get(`${BASE}/api/ping`, () => HttpResponse.json({ ok: true })));

    await httpClient.get('/api/ping');

    expect(useSyncStatusStore.getState().reachability).toBe('online');
  });
});

// ─── Timeout ─────────────────────────────────────────────────────────────────

describe('Timeout', () => {
  it(
    'throws NetworkError with "Tiempo de espera agotado" on AbortError',
    async () => {
      // A resolver throwing an "AbortError" only simulates a server-side
      // error (MSW turns it into a 500, exercising the retry path instead —
      // see the "Network failures" tests above for the same pitfall). The
      // real timeout path is driven by httpClient's own AbortController
      // (TIMEOUT_MS), so the handler must actually hang past that timeout
      // for the client to abort it itself.
      server.use(
        http.get(`${BASE}/api/slow`, () => delay('infinite')),
      );

      await expect(httpClient.get('/api/slow')).rejects.toMatchObject({
        name: 'NetworkError',
        message: 'Tiempo de espera agotado',
      });
    },
    20000,
  );
});
