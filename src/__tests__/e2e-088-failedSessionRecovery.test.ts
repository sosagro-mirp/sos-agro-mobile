/**
 * Spec 88 — Recuperación de encuestas atascadas por sesión de campaña fallida.
 *
 * Cubre los criterios 1, 2, 4, 5, 6 y 7 de
 * `spec/88_recuperacion_sesiones_fallidas_401.md`. Los criterios 3, 8, 9 y 10
 * (sincronización real contra el servidor, UI y entrega por OTA) se verifican
 * en la ronda manual `docs/testing/test-088-recuperacion-sesiones-fallidas.md`.
 *
 * Escrito en rojo antes de crear `src/sync/planSessionRecovery.ts`: hoy falla
 * entero porque ese módulo todavía no existe.
 *
 * El plan es una función pura —igual que `uninstallReadiness` del spec 35— para
 * poder probar la decisión sin base de datos viva. El servicio que la aplica
 * (`recoverStuckSessions.ts`) se cubre en la ronda manual.
 */

import {
  planSessionRecovery,
  shouldRetrySessionLater,
  type FailedSessionInput,
  type StuckQueueEntryInput,
} from '../sync/planSessionRecovery';
import { NetworkError, ServerError } from '../api/httpClient';

const session = (localSessionId: string, hasData: boolean): FailedSessionInput => ({
  localSessionId,
  hasData,
});

const entry = (id: string, campaignSessionId: string): StuckQueueEntryInput => ({
  id,
  campaignSessionId,
  status: 'failed_validation',
});

// ─── Criterio 1: una sesión fallida con datos vuelve a pending ───────────────

describe('planSessionRecovery — sesiones', () => {
  it('reactiva una sesión fallida que todavía tiene datos apuntándola', () => {
    const plan = planSessionRecovery({
      failedSessions: [session('local_session_9eb71ab1', true)],
      stuckEntries: [],
    });

    expect(plan.sessionsToReset).toEqual(['local_session_9eb71ab1']);
    expect(plan.orphanSessionsSkipped).toEqual([]);
  });

  // ─── Criterio 4: una sesión huérfana se deja intacta ──────────────────────
  it('deja intacta una sesión fallida que ningún dato referencia', () => {
    const plan = planSessionRecovery({
      failedSessions: [session('local_session_huerfana', false)],
      stuckEntries: [],
    });

    expect(plan.sessionsToReset).toEqual([]);
    expect(plan.orphanSessionsSkipped).toEqual(['local_session_huerfana']);
  });

  it('separa las sesiones con datos de las huérfanas en el mismo plan', () => {
    const plan = planSessionRecovery({
      failedSessions: [
        session('local_session_con_datos', true),
        session('local_session_huerfana', false),
      ],
      stuckEntries: [],
    });

    expect(plan.sessionsToReset).toEqual(['local_session_con_datos']);
    expect(plan.orphanSessionsSkipped).toEqual(['local_session_huerfana']);
  });
});

// ─── Criterio 2: las entradas de esa sesión vuelven a la cola ────────────────

describe('planSessionRecovery — entradas de la cola', () => {
  it('re-encola las entradas con error de una sesión recuperada', () => {
    const plan = planSessionRecovery({
      failedSessions: [session('local_session_9eb71ab1', true)],
      stuckEntries: [
        entry('entry-1', 'local_session_9eb71ab1'),
        entry('entry-2', 'local_session_9eb71ab1'),
      ],
    });

    expect(plan.entriesToRequeue).toEqual(['entry-1', 'entry-2']);
  });

  it('no toca entradas de una sesión huérfana que no se reactiva', () => {
    const plan = planSessionRecovery({
      failedSessions: [session('local_session_huerfana', false)],
      stuckEntries: [entry('entry-1', 'local_session_huerfana')],
    });

    expect(plan.entriesToRequeue).toEqual([]);
  });

  it('no toca entradas cuya sesión ya está resuelta y no aparece como fallida', () => {
    const plan = planSessionRecovery({
      failedSessions: [],
      stuckEntries: [entry('entry-1', 'local_session_ya_resuelta')],
    });

    expect(plan.entriesToRequeue).toEqual([]);
    expect(plan.sessionsToReset).toEqual([]);
  });
});

// ─── Criterio 6: la recuperación nunca borra ─────────────────────────────────

describe('planSessionRecovery — nunca borra', () => {
  it('el plan solo describe cambios de estado, sin ninguna eliminación', () => {
    const plan = planSessionRecovery({
      failedSessions: [
        session('local_session_con_datos', true),
        session('local_session_huerfana', false),
      ],
      stuckEntries: [entry('entry-1', 'local_session_con_datos')],
    });

    // El plan no debe exponer ninguna clave de borrado: si alguien agrega una,
    // este test lo delata antes de que llegue a una tableta con datos reales.
    expect(Object.keys(plan).sort()).toEqual(
      ['entriesToRequeue', 'orphanSessionsSkipped', 'sessionsToReset'].sort(),
    );
  });
});

// ─── Criterio 5 (parte pura): idempotencia ───────────────────────────────────

describe('planSessionRecovery — idempotencia', () => {
  it('sin sesiones fallidas devuelve un plan vacío', () => {
    const plan = planSessionRecovery({ failedSessions: [], stuckEntries: [] });

    expect(plan.sessionsToReset).toEqual([]);
    expect(plan.entriesToRequeue).toEqual([]);
    expect(plan.orphanSessionsSkipped).toEqual([]);
  });

  it('el mismo estado de entrada produce siempre el mismo plan', () => {
    const input = {
      failedSessions: [session('local_session_9eb71ab1', true)],
      stuckEntries: [entry('entry-1', 'local_session_9eb71ab1')],
    };

    expect(planSessionRecovery(input)).toEqual(planSessionRecovery(input));
  });
});

// ─── Criterio 7: un 401 no marca la sesión como fallida ──────────────────────

describe('shouldRetrySessionLater', () => {
  it('un 401 es transitorio: la sesión sigue pendiente', () => {
    expect(shouldRetrySessionLater(new ServerError(401, 'Unauthorized'))).toBe(true);
  });

  it('un error de red sigue siendo transitorio', () => {
    expect(shouldRetrySessionLater(new NetworkError('Sin conexión a internet'))).toBe(true);
  });

  it('un 429 es transitorio: varias tabletas en el mismo wifi', () => {
    expect(shouldRetrySessionLater(new ServerError(429, 'Too Many Requests'))).toBe(true);
  });

  it('un 400 no es transitorio: la sesión sí se marca como fallida', () => {
    expect(shouldRetrySessionLater(new ServerError(400, 'Bad Request'))).toBe(false);
  });

  it('un 403 no es transitorio', () => {
    expect(shouldRetrySessionLater(new ServerError(403, 'Forbidden'))).toBe(false);
  });

  it('un error desconocido no es transitorio', () => {
    expect(shouldRetrySessionLater(new Error('boom'))).toBe(false);
  });
});
