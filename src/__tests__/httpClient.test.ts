/**
 * Tests for httpClient using MSW to intercept fetch calls.
 *
 * expo-secure-store is mocked to return null (no token), so requests go
 * out without an Authorization header.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { httpClient, NetworkError, ServerError } from '../../api/httpClient';

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
  beforeEach(() => {
    // Speed up retries to avoid slow tests — jest fake timers aren't needed
    // because the exponential backoff is inside the module. We accept the
    // small delay for these tests (1s + 2s + 4s) but cap the server error
    // to always return 500 so all retries exhaust.
    jest.setTimeout(30_000);
  });

  afterEach(() => {
    jest.setTimeout(5_000);
  });

  it('retries on 500 and throws ServerError after all retries are exhausted', async () => {
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
  });

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
    server.use(
      http.get(`${BASE}/api/unreachable`, () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(httpClient.get('/api/unreachable')).rejects.toMatchObject({
      name: 'NetworkError',
    });
  });

  it('NetworkError is not a ServerError', async () => {
    server.use(
      http.get(`${BASE}/api/offline`, () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    try {
      await httpClient.get('/api/offline');
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(NetworkError);
      expect(err).not.toBeInstanceOf(ServerError);
    }
  });
});

// ─── Timeout ─────────────────────────────────────────────────────────────────

describe('Timeout', () => {
  it('throws NetworkError with "Tiempo de espera agotado" on AbortError', async () => {
    server.use(
      http.get(`${BASE}/api/slow`, async () => {
        // Simulate a timeout by throwing an AbortError from the handler
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }),
    );

    await expect(httpClient.get('/api/slow')).rejects.toMatchObject({
      name: 'NetworkError',
      message: 'Tiempo de espera agotado',
    });
  });
});
