/**
 * Spec 35 — Verificación «listo para cambiar de app».
 *
 * Cubre el criterio 7 de `spec/35_despliegue_mobile_produccion.md`: el
 * veredicto es «No listo» si existe cualquier registro sin sincronizar en las
 * tablas de la Fase 2, y «Listo» solo cuando todos los conteos están en 0.
 * Los motivos nombran lo pendiente en lenguaje legible para el encuestador.
 *
 * Se escribió en rojo (18/18 fallando) antes de crear `src/lib/uninstallReadiness.ts`.
 */

import { evaluateUninstallReadiness, type LocalPendingCounts } from '../lib/uninstallReadiness';

const ZERO: LocalPendingCounts = {
  surveysDraft: 0,
  surveysCompleted: 0,
  syncPending: 0,
  syncInFlight: 0,
  syncFailedValidation: 0,
  mediaPending: 0,
  mediaInFlight: 0,
  mediaFailed: 0,
  sessionsPending: 0,
  sessionsFailed: 0,
  changeRequestsPendingSync: 0,
  consentsPending: 0,
  consentsFailed: 0,
  farmPlotsDraft: 0,
};

// Tabla y estado de la Fase 2 → texto que debe aparecer en el motivo.
const CASES: [keyof LocalPendingCounts, RegExp][] = [
  ['surveysDraft', /borrador/i],
  ['surveysCompleted', /encuesta.*sin sincronizar/i],
  ['syncPending', /envío.*pendiente/i],
  ['syncInFlight', /envío.*en curso/i],
  ['syncFailedValidation', /envío.*error/i],
  ['mediaPending', /adjunto.*sin subir/i],
  ['mediaInFlight', /adjunto.*subiendo/i],
  ['mediaFailed', /adjunto.*error/i],
  ['sessionsPending', /sesi[oó]n.*pendiente/i],
  ['sessionsFailed', /sesi[oó]n.*error/i],
  ['changeRequestsPendingSync', /solicitud.*cambio/i],
  ['consentsPending', /consentimiento.*pendiente/i],
  ['consentsFailed', /consentimiento.*error/i],
  ['farmPlotsDraft', /lote.*borrador/i],
];

describe('Spec 35 — evaluateUninstallReadiness', () => {
  it('devuelve «Listo» sin motivos cuando todos los conteos están en 0', () => {
    expect(evaluateUninstallReadiness(ZERO)).toEqual({ ready: true, reasons: [] });
  });

  it.each(CASES)('un conteo > 0 en %s bloquea el veredicto y lo nombra', (key, pattern) => {
    const result = evaluateUninstallReadiness({ ...ZERO, [key]: 1 });
    expect(result.ready).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(pattern);
    expect(result.reasons[0]).toMatch(/^1 /);
  });

  it('incluye la cantidad y usa plural cuando hay más de uno', () => {
    const result = evaluateUninstallReadiness({ ...ZERO, surveysDraft: 2, mediaPending: 3 });
    expect(result.ready).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/^2 borradores/), expect.stringMatching(/^3 adjuntos/)]),
    );
  });

  it('lista un motivo por cada tabla y estado con pendientes', () => {
    const all = Object.fromEntries(Object.keys(ZERO).map((k) => [k, 1])) as LocalPendingCounts;
    const result = evaluateUninstallReadiness(all);
    expect(result.ready).toBe(false);
    expect(result.reasons).toHaveLength(Object.keys(ZERO).length);
  });

  it('trata conteos negativos o no numéricos como bloqueantes (nunca da «Listo» por un dato inválido)', () => {
    expect(evaluateUninstallReadiness({ ...ZERO, syncPending: Number.NaN }).ready).toBe(false);
    expect(evaluateUninstallReadiness({ ...ZERO, syncPending: -1 }).ready).toBe(false);
  });
});
