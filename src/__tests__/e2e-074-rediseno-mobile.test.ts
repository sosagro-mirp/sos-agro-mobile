/**
 * Spec 74 — Migración incremental de la UI móvil al diseño nuevo.
 *
 * Cada bloque nace EN ROJO junto con el spec y se pone en verde al
 * implementar su fase; el resto del spec es visual y se valida en
 * `docs/testing/test-074-migracion-ui-mobile.md`.
 *
 *   Fase 0 → tokens de header y skeleton — ✅ en verde
 *   Fase 1 → léxico de estado de cola — ✅ en verde
 *   Fase 8 → geometría del polígono — en rojo
 */

import { lightColors, darkColors } from '../theme/colors';
import { resolveQueueStatus, resolveCounterTone } from '../lib/queueStatus';

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
    expect(lightColors.headerBg).toBe('#1B6B3A');
    expect(lightColors.headerFg).toBe('#FFFFFF');
  });

  it('en oscuro el header deja de ser amarillo de marca y usa surfaceMuted', () => {
    // Decisión 10 del rediseño: elimina el amarillo sobre amarillo del spec 63.
    expect(darkColors.headerBg).toBe(darkColors.surfaceMuted);
    expect(darkColors.headerBg).not.toBe(darkColors.brand);
    expect(darkColors.headerFg).toBe('#F1F5F9');
  });
});

// ─── Fase 1 · Léxico único de estado de cola ────────────────────────────────

describe('spec 74 · Fase 1 — léxico de estado de cola', () => {
  it('asigna un único par color+ícono a cada estado', () => {
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

// ─── Fase 10 · Breakpoint de tablet ──────────────────────────────────────────

describe('spec 74 · Fase 10 — breakpoint de tablet', () => {
  it('clasifica como "phone" por debajo de 720 dp lógicos', () => {
    const { resolveBreakpoint } = require('../lib/resolveBreakpoint');

    expect(resolveBreakpoint(375)).toBe('phone');
    expect(resolveBreakpoint(719)).toBe('phone');
  });

  it('clasifica como "tablet" a partir de 720 dp lógicos, inclusive', () => {
    const { resolveBreakpoint } = require('../lib/resolveBreakpoint');

    expect(resolveBreakpoint(720)).toBe('tablet');
    expect(resolveBreakpoint(1024)).toBe('tablet');
  });

  it('exporta el umbral como constante para que la UI no lo duplique', () => {
    const { TABLET_BREAKPOINT } = require('../lib/resolveBreakpoint');

    expect(TABLET_BREAKPOINT).toBe(720);
  });

  // Hallazgo TC-074-87: una tablet en portrait puede clasificar como
  // "tablet" por TABLET_BREAKPOINT (≥720dp) y aun así ser demasiado angosta
  // para los paneles fijos del instrumento (280+560+250) o de Lotes
  // (380+310) sin comprimirlos. `resolveBreakpoint` acepta un umbral propio
  // para esos layouts específicos, más exigente que el general.
  it('acepta un umbral propio, más alto que el general, para layouts de paneles fijos', () => {
    const { resolveBreakpoint, INSTRUMENT_PANELS_MIN_WIDTH, LOTES_PANELS_MIN_WIDTH } =
      require('../lib/resolveBreakpoint');

    // 800dp: "tablet" por el umbral general, pero angosto para los paneles.
    expect(resolveBreakpoint(800)).toBe('tablet');
    expect(resolveBreakpoint(800, INSTRUMENT_PANELS_MIN_WIDTH)).toBe('phone');
    expect(resolveBreakpoint(800, LOTES_PANELS_MIN_WIDTH)).toBe('tablet');

    expect(resolveBreakpoint(INSTRUMENT_PANELS_MIN_WIDTH, INSTRUMENT_PANELS_MIN_WIDTH)).toBe('tablet');
    expect(resolveBreakpoint(LOTES_PANELS_MIN_WIDTH, LOTES_PANELS_MIN_WIDTH)).toBe('tablet');
  });
});

// ─── Fase 10 · Razón de visibilidad de las condicionales (panel de contexto) ─

describe('spec 74 · Fase 10 — razón de condicionales', () => {
  const triggerYesNo = {
    questionId: 'q1',
    text: '¿Tiene acceso a internet?',
    isRequired: true,
    order: 0,
    type: { typeId: 't1', name: 'yes_no' },
    options: [],
  };

  const triggerSingleChoice = {
    questionId: 'q2',
    text: '¿Qué tipo de cultivo tiene?',
    isRequired: true,
    order: 1,
    type: { typeId: 't2', name: 'single_choice' },
    options: [
      { optionId: 'opt-cafe', text: 'Café', value: 'cafe' },
      { optionId: 'opt-cacao', text: 'Cacao', value: 'cacao' },
    ],
  };

  it('devuelve null si la pregunta no es condicional', () => {
    const { resolveConditionReason } = require('../lib/resolveConditionReason');
    const plain = { ...triggerYesNo, questionId: 'q3', conditionQuestionId: null, conditionValue: null };

    expect(resolveConditionReason(plain, [triggerYesNo], {})).toBeNull();
  });

  it('arma la razón para una condición yes_no', () => {
    const { resolveConditionReason } = require('../lib/resolveConditionReason');
    const conditional = {
      ...triggerYesNo,
      questionId: 'q4',
      conditionQuestionId: 'q1',
      conditionValue: 'true',
    };

    const reason = resolveConditionReason(conditional, [triggerYesNo, conditional], {});
    expect(reason).toContain('Sí');
    expect(reason).toContain('¿Tiene acceso a internet?');
  });

  it('arma la razón para una condición single_choice, usando el texto de la opción', () => {
    const { resolveConditionReason } = require('../lib/resolveConditionReason');
    const conditional = {
      ...triggerSingleChoice,
      questionId: 'q5',
      conditionQuestionId: 'q2',
      conditionValue: 'opt-cafe',
    };

    const reason = resolveConditionReason(conditional, [triggerSingleChoice, conditional], {});
    expect(reason).toContain('Café');
    expect(reason).toContain('¿Qué tipo de cultivo tiene?');
  });
});
