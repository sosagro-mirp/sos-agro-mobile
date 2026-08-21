/**
 * Spec 24 — Overflow de texto y escalado de fuente del sistema.
 *
 * Cubre los criterios de aceptación 5 y 6 de `mobile/specs/spec24.md`.
 *
 * ARRANCA EN ROJO: `src/components/common/AppText.tsx` todavía no existe
 * (Fase 2 del spec).
 *
 * Contexto del bug: no hay ningún techo de escalado de fuente en el proyecto
 * (verificado: `maxFontSizeMultiplier` no se usa en todo `src/` ni `app/`), así
 * que el multiplicador del sistema se aplica sin límite. En los headers, que
 * son filas con `justifyContent: 'space-between'` y sin `flexShrink`, eso corta
 * los textos "Sin conexión" y "Actualizar" (reportado en Galaxy S25 / One UI).
 *
 * NOTA DE DISEÑO — por qué se prueba un resolver y no el render:
 * el proyecto no tiene `@testing-library/react-native` ni `react-test-renderer`
 * instalados, y este spec no agrega dependencias. Por eso `AppText` expone la
 * resolución de props como función pura (`resolveAppTextProps`), que es donde
 * vive toda la lógica del wrapper; el componente solo la aplica sobre `<Text>`.
 * El resultado visual se valida en la ronda manual (`docs/testing/22-test-spec24.md`).
 */

import {
  MAX_FONT_SCALE,
  resolveAppTextProps,
} from '../components/common/AppText';

describe('spec24 — AppText / resolveAppTextProps', () => {
  // Criterio 5
  it('aplica MAX_FONT_SCALE como maxFontSizeMultiplier por defecto', () => {
    const resolved = resolveAppTextProps({});

    expect(resolved.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE);
  });

  // Criterio 5 — el default no debe ser una imposición: hay textos de contenido
  // (enunciados de preguntas, opciones) que deben poder escalar más, o sin techo.
  it('respeta un maxFontSizeMultiplier pasado explícitamente en el call-site', () => {
    const resolved = resolveAppTextProps({ maxFontSizeMultiplier: 2.5 });

    expect(resolved.maxFontSizeMultiplier).toBe(2.5);
  });

  it('permite desactivar el techo pasando maxFontSizeMultiplier undefined de forma explícita', () => {
    const resolved = resolveAppTextProps({ maxFontSizeMultiplier: 0 });

    // 0 significa "sin límite" en React Native; no debe ser reemplazado por el default.
    expect(resolved.maxFontSizeMultiplier).toBe(0);
  });

  // Criterio 6
  it('reenvía numberOfLines sin alterarlo', () => {
    const resolved = resolveAppTextProps({ numberOfLines: 1 });

    expect(resolved.numberOfLines).toBe(1);
    expect(resolved.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE);
  });

  // Criterio 6
  it('reenvía style, onPress y props de accesibilidad sin alterarlos', () => {
    const style = { fontSize: 12, color: '#fff' };
    const onPress = () => {};

    const resolved = resolveAppTextProps({
      style,
      onPress,
      accessibilityRole: 'button',
      accessibilityLabel: 'Estado de conexión',
    });

    expect(resolved.style).toBe(style);
    expect(resolved.onPress).toBe(onPress);
    expect(resolved.accessibilityRole).toBe('button');
    expect(resolved.accessibilityLabel).toBe('Estado de conexión');
  });

  it('no agrega props que el call-site no pidió, más allá del techo de escalado', () => {
    const resolved = resolveAppTextProps({ numberOfLines: 1 });

    expect(Object.keys(resolved).sort()).toEqual(
      ['maxFontSizeMultiplier', 'numberOfLines'].sort(),
    );
  });

  // El valor definitivo se fija con la medición de TC-024-01 sobre el
  // dispositivo del piloto. Este caso solo acota el rango razonable: un techo
  // menor a 1 encogería el texto respecto al diseño, y uno mayor a 1.5 no
  // resolvería el corte que motivó el spec.
  it('MAX_FONT_SCALE está en un rango razonable', () => {
    expect(typeof MAX_FONT_SCALE).toBe('number');
    expect(MAX_FONT_SCALE).toBeGreaterThan(1);
    expect(MAX_FONT_SCALE).toBeLessThanOrEqual(1.5);
  });
});
