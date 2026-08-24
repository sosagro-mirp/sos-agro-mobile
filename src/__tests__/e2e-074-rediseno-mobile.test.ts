/**
 * Spec 74 — Migración incremental de la UI móvil al diseño nuevo.
 *
 * Estos tests nacen EN ROJO junto con el spec: los módulos que importan todavía
 * no existen. Cubren la única lógica pura que el rediseño introduce; el resto
 * del spec es visual y se valida en `docs/testing/test-074-migracion-ui-mobile.md`.
 *
 * Al implementar cada fase, se descomenta y se pone en verde el bloque
 * correspondiente:
 *   Fase 0 → tokens de header y skeleton
 *   Fase 1 → léxico de estado de cola
 *   Fase 8 → geometría del polígono
 */

import { lightColors, darkColors } from '../theme/colors';

// ─── Fase 0 · Tokens de header y skeleton ───────────────────────────────────

describe('spec 74 · Fase 0 — tokens de tema', () => {
  it('define los tokens de header y skeleton en ambos temas', () => {
    for (const token of [
      'headerBg',
      'headerFg',
      'headerSub',
      'headerPill',
      'headerBorder',
      'skeleton',
    ] as const) {
      expect(lightColors).toHaveProperty(token);
      expect(darkColors).toHaveProperty(token);
    }
  });

  it('en claro el header usa el verde institucional', () => {
    // @ts-expect-error el token no existe hasta la Fase 0
    expect(lightColors.headerBg).toBe('#1B6B3A');
    // @ts-expect-error el token no existe hasta la Fase 0
    expect(lightColors.headerFg).toBe('#FFFFFF');
  });

  it('en oscuro el header deja de ser amarillo de marca y usa surfaceMuted', () => {
    // Decisión 10 del rediseño: elimina el amarillo sobre amarillo del spec 63.
    // @ts-expect-error el token no existe hasta la Fase 0
    expect(darkColors.headerBg).toBe(darkColors.surfaceMuted);
    // @ts-expect-error el token no existe hasta la Fase 0
    expect(darkColors.headerBg).not.toBe(darkColors.brand);
    // @ts-expect-error el token no existe hasta la Fase 0
    expect(darkColors.headerFg).toBe('#F1F5F9');
  });
});

// ─── Fase 1 · Léxico único de estado de cola ────────────────────────────────

describe('spec 74 · Fase 1 — léxico de estado de cola', () => {
  it('asigna un único par color+ícono a cada estado', () => {
    const { resolveQueueStatus } = require('../lib/queueStatus');

    expect(resolveQueueStatus('pending', lightColors)).toMatchObject({
      icon: 'Clock',
      fg: lightColors.warningFg,
      bg: lightColors.warningBg,
    });
    expect(resolveQueueStatus('synced', lightColors)).toMatchObject({
      icon: 'Check',
      fg: lightColors.successFg,
    });
    expect(resolveQueueStatus('failed', lightColors)).toMatchObject({
      icon: 'CircleAlert',
      fg: lightColors.dangerFg,
    });
    expect(resolveQueueStatus('attachment', lightColors)).toMatchObject({
      icon: 'Paperclip',
      fg: lightColors.warningFg,
    });
  });

  it('apaga a neutro los contadores en cero', () => {
    const { resolveCounterTone } = require('../lib/queueStatus');

    expect(resolveCounterTone(0, 'pending', lightColors).fg).toBe(lightColors.textMuted);
    expect(resolveCounterTone(4, 'pending', lightColors).fg).toBe(lightColors.warningFg);
    expect(resolveCounterTone(2, 'failed', lightColors).fg).toBe(lightColors.dangerFg);
  });
});

// ─── Fase 8 · Geometría del polígono (croquis y área) ───────────────────────

describe('spec 74 · Fase 8 — geometría del polígono', () => {
  // Cuadrado de ~100 m de lado cerca de Andes, Antioquia (lat ≈ 5.658).
  // 100 m ≈ 0.000899° de latitud; en longitud se corrige por cos(lat).
  const LAT = 5.658214;
  const DLAT = 0.000899;
  const DLNG = 0.000899 / Math.cos((LAT * Math.PI) / 180);

  const square = [
    { lat: LAT, lng: -75.878903 },
    { lat: LAT + DLAT, lng: -75.878903 },
    { lat: LAT + DLAT, lng: -75.878903 + DLNG },
    { lat: LAT, lng: -75.878903 + DLNG },
  ];

  it('calcula el área en hectáreas por la fórmula de Gauss', () => {
    const { polygonAreaHectares } = require('../lib/polygonGeometry');

    // 100 m × 100 m = 10 000 m² = 1 ha, con 2% de tolerancia por la proyección.
    expect(polygonAreaHectares(square)).toBeCloseTo(1, 1);
  });

  it('devuelve 0 con menos de tres puntos', () => {
    const { polygonAreaHectares } = require('../lib/polygonGeometry');

    expect(polygonAreaHectares([])).toBe(0);
    expect(polygonAreaHectares(square.slice(0, 2))).toBe(0);
  });

  it('no depende del sentido de captura del polígono', () => {
    const { polygonAreaHectares } = require('../lib/polygonGeometry');

    expect(polygonAreaHectares([...square].reverse())).toBeCloseTo(
      polygonAreaHectares(square),
      5,
    );
  });

  it('proyecta los vértices dentro del viewBox respetando el margen', () => {
    const { projectPolygon } = require('../lib/polygonGeometry');

    const projected = projectPolygon(square, { width: 200, height: 150, margin: 12 });

    expect(projected).toHaveLength(4);
    for (const p of projected) {
      expect(p.x).toBeGreaterThanOrEqual(12);
      expect(p.x).toBeLessThanOrEqual(188);
      expect(p.y).toBeGreaterThanOrEqual(12);
      expect(p.y).toBeLessThanOrEqual(138);
    }
  });

  it('conserva la relación de aspecto al autoescalar', () => {
    const { projectPolygon } = require('../lib/polygonGeometry');

    // Rectángulo el doble de ancho que de alto: debe seguir siéndolo al proyectar.
    const wide = [
      { lat: LAT, lng: -75.878903 },
      { lat: LAT + DLAT, lng: -75.878903 },
      { lat: LAT + DLAT, lng: -75.878903 + DLNG * 2 },
      { lat: LAT, lng: -75.878903 + DLNG * 2 },
    ];

    const projected = projectPolygon(wide, { width: 200, height: 150, margin: 12 });
    const xs = projected.map((p: { x: number }) => p.x);
    const ys = projected.map((p: { y: number }) => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);

    expect(w / h).toBeCloseTo(2, 1);
  });

  it('no divide por cero cuando todos los puntos coinciden', () => {
    const { projectPolygon } = require('../lib/polygonGeometry');

    const degenerate = [square[0], square[0], square[0]];
    const projected = projectPolygon(degenerate, { width: 200, height: 150, margin: 12 });

    for (const p of projected) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
