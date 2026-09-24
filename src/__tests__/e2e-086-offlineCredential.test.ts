/**
 * Spec 86 — Sesión persistente en tablets compartidas sin conexión.
 * Credencial verificable sin conexión (estrategia C, decisión D7).
 *
 * Cubre CA-9, CA-10, CA-11 y CA-14 de
 * `spec/86_sesion_persistente_tablets_compartidas.md`.
 *
 * ARRANCA EN ROJO: `src/lib/offlineCredential.ts` todavía no existe (Fase 2)
 * y `@noble/hashes` aún no está instalado (requiere autorización, Fase 0).
 *
 * Se usa la implementación real de PBKDF2 con pocas iteraciones para que la
 * suite sea rápida; el valor productivo se calibra en la tablet (Fase 0).
 */

import {
  createOfflineCredential,
  verifyOfflinePassword,
  evaluateOfflineLogin,
  registerFailedAttempt,
  registerSuccessfulLogin,
  selectUsersToEvict,
  parseStoredCredential,
  OFFLINE_CREDENTIAL_MAX_AGE_DAYS,
  MAX_FAILED_ATTEMPTS_BEFORE_ONLINE,
  LOCKOUT_STEPS_MS,
  CLOCK_ROLLBACK_TOLERANCE_MS,
  MAX_KNOWN_USERS,
} from '../lib/offlineCredential';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const T0 = Date.UTC(2026, 8, 19, 12, 0, 0);
const TEST_ITERATIONS = 1_000;

const USER_A = { userId: 'a3f1c9d2-0000-4000-8000-00000000000a', email: 'ana@sosagro.test' };
const USER_B = { userId: 'a3f1c9d2-0000-4000-8000-00000000000b', email: 'beto@sosagro.test' };
const PASSWORD = 'CampoSinSenal!2026';

async function credFor(user = USER_A, now = T0) {
  return createOfflineCredential({
    userId: user.userId,
    email: user.email,
    password: PASSWORD,
    profile: { userId: user.userId, name: 'Ana', lastName: 'Pérez', email: user.email, role: 'pollster' },
    iterations: TEST_ITERATIONS,
    now,
  });
}

describe('spec86 / parámetros aprobados (2026-09-19)', () => {
  it('fija los valores aprobados por el usuario', () => {
    expect(OFFLINE_CREDENTIAL_MAX_AGE_DAYS).toBe(30);
    expect(MAX_FAILED_ATTEMPTS_BEFORE_ONLINE).toBe(10);
    expect(LOCKOUT_STEPS_MS).toEqual([5 * MIN_MS, 15 * MIN_MS, 60 * MIN_MS]);
    expect(CLOCK_ROLLBACK_TOLERANCE_MS).toBe(DAY_MS);
    expect(MAX_KNOWN_USERS).toBe(10);
  });
});

describe('spec86 / CA-9 — verificación local de la contraseña', () => {
  it('acepta la misma contraseña y rechaza otra', async () => {
    const cred = await credFor();
    await expect(verifyOfflinePassword(cred, PASSWORD)).resolves.toBe(true);
    await expect(verifyOfflinePassword(cred, 'otra-clave')).resolves.toBe(false);
    await expect(verifyOfflinePassword(cred, '')).resolves.toBe(false);
  });

  it('el email se normaliza a minúsculas', async () => {
    const cred = await createOfflineCredential({
      userId: USER_A.userId,
      email: 'ANA@SosAgro.Test',
      password: PASSWORD,
      profile: { userId: USER_A.userId, name: 'Ana', lastName: '', email: USER_A.email, role: 'pollster' },
      iterations: TEST_ITERATIONS,
      now: T0,
    });
    expect(cred.email).toBe('ana@sosagro.test');
  });
});

describe('spec86 / CA-14 — la contraseña nunca se guarda en claro', () => {
  it('solo persiste algoritmo, iteraciones, sal y hash', async () => {
    const cred = await credFor();
    const serialized = JSON.stringify(cred);

    expect(serialized).not.toContain(PASSWORD);
    expect(cred.algorithm).toBe('pbkdf2-sha256');
    expect(cred.iterations).toBe(TEST_ITERATIONS);
    expect(typeof cred.salt).toBe('string');
    expect(typeof cred.hash).toBe('string');
    expect(cred).not.toHaveProperty('password');
  });

  it('dos usuarios con la misma contraseña tienen sal y hash distintos', async () => {
    const a = await credFor(USER_A);
    const b = await credFor(USER_B);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('spec86 / CA-11 — vigencia de 30 días y retroceso del reloj', () => {
  it('permite el ingreso a los 29 días', async () => {
    const cred = await credFor();
    expect(evaluateOfflineLogin(cred, T0 + 29 * DAY_MS)).toEqual({ allowed: true });
  });

  it('rechaza el ingreso a los 31 días por vencimiento', async () => {
    const cred = await credFor();
    expect(evaluateOfflineLogin(cred, T0 + 31 * DAY_MS)).toMatchObject({
      allowed: false,
      reason: 'expired',
    });
  });

  it('rechaza si el reloj retrocede más de 24 h respecto de la marca máxima vista', async () => {
    const cred = await credFor();
    expect(evaluateOfflineLogin(cred, T0 - 2 * DAY_MS)).toMatchObject({
      allowed: false,
      reason: 'clock_rollback',
    });
  });

  it('tolera un retroceso menor a 24 h (ajuste normal del reloj)', async () => {
    const cred = await credFor();
    expect(evaluateOfflineLogin(cred, T0 - 2 * 60 * MIN_MS)).toEqual({ allowed: true });
  });

  it('rechaza si la credencial quedó marcada como "requiere ingreso con conexión"', async () => {
    const cred = { ...(await credFor()), requiresOnlineLogin: true };
    expect(evaluateOfflineLogin(cred, T0)).toMatchObject({
      allowed: false,
      reason: 'requires_online',
    });
  });
});

describe('spec86 / CA-10 — bloqueo escalonado por intentos fallidos', () => {
  it('4 fallos no bloquean; el 5.º bloquea 5 minutos', async () => {
    let cred = await credFor();
    for (let i = 0; i < 4; i++) cred = registerFailedAttempt(cred, T0);
    expect(evaluateOfflineLogin(cred, T0)).toEqual({ allowed: true });

    cred = registerFailedAttempt(cred, T0);
    expect(evaluateOfflineLogin(cred, T0 + 1 * MIN_MS)).toMatchObject({
      allowed: false,
      reason: 'locked',
      lockedUntil: T0 + 5 * MIN_MS,
    });
    expect(evaluateOfflineLogin(cred, T0 + 5 * MIN_MS + 1)).toEqual({ allowed: true });
  });

  it('el bloqueo escala a 15 y luego a 60 minutos', async () => {
    let cred = await credFor();
    let now = T0;
    for (let i = 0; i < 5; i++) cred = registerFailedAttempt(cred, now);
    expect(cred.lockedUntil).toBe(now + 5 * MIN_MS);

    now = cred.lockedUntil! + 1;
    cred = registerFailedAttempt(cred, now);
    expect(cred.lockedUntil).toBe(now + 15 * MIN_MS);

    now = cred.lockedUntil! + 1;
    cred = registerFailedAttempt(cred, now);
    expect(cred.lockedUntil).toBe(now + 60 * MIN_MS);
  });

  it('10 fallos acumulados exigen ingreso con conexión', async () => {
    let cred = await credFor();
    let now = T0;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS_BEFORE_ONLINE; i++) {
      cred = registerFailedAttempt(cred, now);
      now = (cred.lockedUntil ?? now) + 1;
    }
    expect(cred.requiresOnlineLogin).toBe(true);
    expect(evaluateOfflineLogin(cred, now)).toMatchObject({ allowed: false, reason: 'requires_online' });
  });

  it('un ingreso correcto reinicia el contador y el bloqueo', async () => {
    let cred = await credFor();
    for (let i = 0; i < 3; i++) cred = registerFailedAttempt(cred, T0);
    cred = registerSuccessfulLogin(cred, T0 + MIN_MS);
    expect(cred.failedAttempts).toBe(0);
    expect(cred.lockedUntil).toBeNull();
  });

  it('el estado de bloqueo es serializable (sobrevive a cerrar la app)', async () => {
    let cred = await credFor();
    for (let i = 0; i < 5; i++) cred = registerFailedAttempt(cred, T0);
    const restored = parseStoredCredential(JSON.stringify(cred));
    expect(evaluateOfflineLogin(restored!, T0 + MIN_MS)).toMatchObject({ allowed: false, reason: 'locked' });
  });
});

describe('spec86 / almacenamiento robusto e índice de usuarios', () => {
  it('un registro corrupto se trata como ausente, sin lanzar', () => {
    expect(parseStoredCredential('{no-es-json')).toBeNull();
    expect(parseStoredCredential(JSON.stringify({ userId: 'x' }))).toBeNull();
    expect(parseStoredCredential(null)).toBeNull();
  });

  it('con más de 10 usuarios sale el más antiguo sin pendientes', () => {
    const known = Array.from({ length: 11 }, (_, i) => ({
      userId: `user-${i}`,
      lastOnlineLoginAt: T0 + i * DAY_MS,
    }));
    // user-0 es el más antiguo pero tiene pendientes: sale user-1.
    expect(selectUsersToEvict(known, new Set(['user-0']))).toEqual(['user-1']);
  });

  it('con 10 usuarios o menos no sale nadie', () => {
    const known = Array.from({ length: 10 }, (_, i) => ({ userId: `u-${i}`, lastOnlineLoginAt: T0 }));
    expect(selectUsersToEvict(known, new Set())).toEqual([]);
  });
});
