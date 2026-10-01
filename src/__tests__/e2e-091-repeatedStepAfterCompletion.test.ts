/**
 * Spec 91 — Al terminar un bloque con conexión, la app no debe reabrir el
 * mismo bloque.
 *
 * Cubre los criterios 1, 2, 3 y 6 de
 * `spec/91_bloque_repetido_al_avanzar_en_linea.md`. Los criterios 4, 5, 7 y 8
 * (tope de espera, estado de carga, flujo sin conexión y entrega por OTA) se
 * verifican en la ronda manual `docs/testing/test-091-bloque-repetido.md`.
 *
 * Escrito en rojo antes de crear `src/lib/planNextStepAfterCompletion.ts`: hoy
 * falla entero porque ese módulo todavía no existe.
 *
 * La decisión se aísla en una función pura —igual que `planSessionRecovery`
 * del spec 88 y `resolveDraftFarmerId` del spec 90— para probarla sin base de
 * datos ni red.
 */

import { planNextStepAfterCompletion } from '../lib/planNextStepAfterCompletion';
import type { NextStepResponse } from '../types';

const BLOQUE_2 = 'inst-bloque-2';
const BLOQUE_3 = 'inst-bloque-3';

const paso = (order: number, instrumentId: string): NextStepResponse => ({
  stepId: `step-${order}`,
  order,
  instrument: { instrumentId, name: `Bloque ${order}`, isActive: true },
  totalSteps: 5,
  completedCount: order - 1,
});

describe('planNextStepAfterCompletion', () => {
  // ─── Criterios 1 y 2: el backend aún no recibe el bloque recién terminado ──
  it('no reabre el paso que se acaba de completar localmente', () => {
    const plan = planNextStepAfterCompletion({
      backendStep: paso(2, BLOQUE_2),
      completedLocally: [
        { stepOrder: 1, instrumentId: 'inst-bloque-1' },
        { stepOrder: 2, instrumentId: BLOQUE_2 },
      ],
    });
    expect(plan.action).toBe('fallback-local');
  });

  it('reconoce el paso completado por instrumento si el borrador no trae stepOrder', () => {
    const plan = planNextStepAfterCompletion({
      backendStep: paso(3, BLOQUE_3),
      completedLocally: [{ stepOrder: null, instrumentId: BLOQUE_3 }],
    });
    expect(plan.action).toBe('fallback-local');
  });

  // ─── Criterio 3: un paso pendiente del backend se respeta ─────────────────
  it('usa el paso del backend cuando no está completado localmente', () => {
    const plan = planNextStepAfterCompletion({
      backendStep: paso(3, BLOQUE_3),
      completedLocally: [
        { stepOrder: 1, instrumentId: 'inst-bloque-1' },
        { stepOrder: 2, instrumentId: BLOQUE_2 },
      ],
    });
    expect(plan.action).toBe('use-backend');
  });

  it('respeta un paso condicional que se salta órdenes intermedios', () => {
    const plan = planNextStepAfterCompletion({
      backendStep: paso(5, 'inst-bloque-5'),
      completedLocally: [{ stepOrder: 2, instrumentId: BLOQUE_2 }],
    });
    expect(plan.action).toBe('use-backend');
  });

  it('no confunde dos pasos del mismo instrumento cuando ambos traen stepOrder', () => {
    const plan = planNextStepAfterCompletion({
      backendStep: paso(4, BLOQUE_2),
      completedLocally: [{ stepOrder: 2, instrumentId: BLOQUE_2 }],
    });
    expect(plan.action).toBe('use-backend');
  });

  // ─── Fin de campaña ───────────────────────────────────────────────────────
  it('acepta el fin de campaña que informa el backend', () => {
    for (const fin of [null, {} as NextStepResponse]) {
      const plan = planNextStepAfterCompletion({
        backendStep: fin,
        completedLocally: [{ stepOrder: 2, instrumentId: BLOQUE_2 }],
      });
      expect(plan.action).toBe('use-backend');
    }
  });

  // ─── Criterio 6: reentrada a una sesión a medias ──────────────────────────
  it('tras reentrar, tampoco reabre un bloque completado de antes', () => {
    const plan = planNextStepAfterCompletion({
      backendStep: paso(1, 'inst-bloque-1'),
      completedLocally: [
        { stepOrder: 1, instrumentId: 'inst-bloque-1' },
        { stepOrder: 2, instrumentId: BLOQUE_2 },
      ],
    });
    expect(plan.action).toBe('fallback-local');
  });

  it('sin nada completado localmente, usa siempre el paso del backend', () => {
    const plan = planNextStepAfterCompletion({
      backendStep: paso(1, 'inst-bloque-1'),
      completedLocally: [],
    });
    expect(plan.action).toBe('use-backend');
  });
});
