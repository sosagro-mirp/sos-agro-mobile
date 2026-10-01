import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  __setNativePbkdf2ForTests,
  createOfflineCredential,
  verifyOfflinePassword,
  type OfflineCredential,
} from '../lib/offlineCredential';

// RFC 7914 §11: PBKDF2-HMAC-SHA256, P="passwd", S="salt", c=1 (primeros 32 bytes).
const RFC_HASH = '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc';

const profile = { userId: 'u1', email: 'a@b.co', name: 'A', lastName: 'B' } as never;

function rfcCredential(): OfflineCredential {
  return {
    version: 1,
    userId: 'u1',
    email: 'a@b.co',
    algorithm: 'pbkdf2-sha256',
    iterations: 1,
    salt: '73616c74', // "salt"
    hash: RFC_HASH,
    lastOnlineLoginAt: 0,
    maxSeenAt: 0,
    failedAttempts: 0,
    lockedUntil: null,
    requiresOnlineLogin: false,
    profile,
  };
}

const fakeNative = jest.fn(
  (
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    keylen: number,
    _digest: string,
    cb: (err: Error | null, key?: Uint8Array) => void,
  ) => cb(null, pbkdf2(sha256, password, salt, { c: iterations, dkLen: keylen })),
);

afterEach(() => {
  __setNativePbkdf2ForTests(undefined);
  fakeNative.mockClear();
});

describe('spec86 / Fase 10 — PBKDF2 nativo con respaldo JS', () => {
  it('sin módulo nativo, el camino JS coincide con el vector RFC 7914', async () => {
    __setNativePbkdf2ForTests(null);
    await expect(verifyOfflinePassword(rfcCredential(), 'passwd')).resolves.toBe(true);
    await expect(verifyOfflinePassword(rfcCredential(), 'otra')).resolves.toBe(false);
  });

  it('con módulo nativo, lo usa con sha256 y 32 bytes, y coincide con el vector', async () => {
    __setNativePbkdf2ForTests(fakeNative);
    await expect(verifyOfflinePassword(rfcCredential(), 'passwd')).resolves.toBe(true);
    expect(fakeNative).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      1,
      32,
      'sha256',
      expect.any(Function),
    );
  });

  it('si el nativo falla, cae al camino JS sin perder la verificación', async () => {
    __setNativePbkdf2ForTests((_p, _s, _i, _k, _d, cb) => cb(new Error('native down')));
    await expect(verifyOfflinePassword(rfcCredential(), 'passwd')).resolves.toBe(true);
  });

  it('una credencial creada con el motor JS se verifica con el nativo', async () => {
    __setNativePbkdf2ForTests(null);
    const cred = await createOfflineCredential({
      userId: 'u1',
      email: 'a@b.co',
      password: 'Secreta-1',
      profile,
      iterations: 50,
    });
    __setNativePbkdf2ForTests(fakeNative);
    await expect(verifyOfflinePassword(cred, 'Secreta-1')).resolves.toBe(true);
    expect(fakeNative).toHaveBeenCalled();
  });
});
