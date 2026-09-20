/**
 * Spec 86 — Sesión persistente en tablets compartidas sin conexión.
 * "Salir" protegido (estrategia D, decisión D8) y asignación de dueño a los
 * registros anteriores a la migración (D6).
 *
 * Cubre CA-19, CA-20, CA-21 y CA-22 de
 * `spec/86_sesion_persistente_tablets_compartidas.md`.
 *
 * ARRANCA EN ROJO: `src/lib/logoutGuard.ts` y `src/lib/backfillOwnership.ts`
 * todavía no existen (Fases 4 y 7).
 */

import { resolveLogoutGuard } from '../lib/logoutGuard';
import { backfillOwnership } from '../lib/backfillOwnership';

const NO_PENDING = { queue: 0, drafts: 0, changeRequests: 0, consents: 0, plots: 0 };

describe('spec86 / CA-21 — cambiar de encuestador no depende de los pendientes', () => {
  it('sin pendientes → confirmación simple', () => {
    expect(resolveLogoutGuard('switch_user', NO_PENDING)).toEqual({ level: 'simple', reasons: [] });
  });

  it('con pendientes → sigue siendo confirmación simple (no se pierde nada)', () => {
    const counts = { ...NO_PENDING, queue: 3, drafts: 1 };
    expect(resolveLogoutGuard('switch_user', counts)).toEqual({ level: 'simple', reasons: [] });
  });
});

describe('spec86 / CA-22 — olvidar la tablet', () => {
  it('sin pendientes → confirmación simple', () => {
    expect(resolveLogoutGuard('forget_device', NO_PENDING)).toEqual({ level: 'simple', reasons: [] });
  });

  it.each([
    ['queue', 'queue'],
    ['drafts', 'drafts'],
    ['changeRequests', 'changeRequests'],
    ['consents', 'consents'],
    ['plots', 'plots'],
  ] as const)('cualquier pendiente de tipo %s → advertencia fuerte con su motivo', (key, reason) => {
    const result = resolveLogoutGuard('forget_device', { ...NO_PENDING, [key]: 2 });
    expect(result.level).toBe('strong');
    expect(result.reasons).toEqual([{ kind: reason, count: 2 }]);
  });

  it('lista todos los motivos cuando hay varios tipos de pendiente', () => {
    const result = resolveLogoutGuard('forget_device', { ...NO_PENDING, queue: 1, drafts: 4 });
    expect(result.level).toBe('strong');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        { kind: 'queue', count: 1 },
        { kind: 'drafts', count: 4 },
      ]),
    );
    expect(result.reasons).toHaveLength(2);
  });
});

describe('spec86 / CA-19 — backfillOwnership asigna dueño una sola vez', () => {
  function makeDeps(overrides: Partial<Parameters<typeof backfillOwnership>[0]> = {}) {
    return {
      isDone: jest.fn().mockResolvedValue(false),
      markDone: jest.fn().mockResolvedValue(undefined),
      getLegacyCachedUserId: jest.fn().mockResolvedValue('user-a'),
      assignNullOwners: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('asigna los registros sin dueño al usuario cacheado y deja la marca', async () => {
    const deps = makeDeps();
    await backfillOwnership(deps);
    expect(deps.assignNullOwners).toHaveBeenCalledWith('user-a');
    expect(deps.markDone).toHaveBeenCalledTimes(1);
  });

  it('es idempotente: si ya corrió, no vuelve a asignar', async () => {
    const deps = makeDeps({ isDone: jest.fn().mockResolvedValue(true) });
    await backfillOwnership(deps);
    expect(deps.assignNullOwners).not.toHaveBeenCalled();
    expect(deps.markDone).not.toHaveBeenCalled();
  });

  it('sin usuario cacheado deja los registros con dueño null (se procesan con la sesión activa)', async () => {
    const deps = makeDeps({ getLegacyCachedUserId: jest.fn().mockResolvedValue(null) });
    await backfillOwnership(deps);
    expect(deps.assignNullOwners).not.toHaveBeenCalled();
    expect(deps.markDone).toHaveBeenCalledTimes(1);
  });

  it('si la asignación falla, no deja la marca (se reintenta en el próximo arranque)', async () => {
    const deps = makeDeps({ assignNullOwners: jest.fn().mockRejectedValue(new Error('db locked')) });
    await expect(backfillOwnership(deps)).rejects.toThrow('db locked');
    expect(deps.markDone).not.toHaveBeenCalled();
  });
});
