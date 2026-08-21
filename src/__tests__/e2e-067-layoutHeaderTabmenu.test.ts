/**
 * e2e-067 — Layout móvil: overflow del header y safe area del tabmenu.
 *
 * Cubre los criterios de aceptación 3 y 4 de
 * `spec/67_layout_movil_header_y_safe_area_tabmenu.md` (raíz del ecosistema), y
 * la parte determinística de los criterios 1 y 2: que la barra de pestañas
 * **reserve** el área segura inferior del sistema en vez de ignorarla.
 *
 * ARRANCA EN ROJO: `src/lib/resolveTabBarStyle.ts` todavía no existe (Fase 1
 * del spec).
 *
 * Contexto del bug (Hallazgo B del piloto del 2026-08-12, 2 tablets Samsung
 * Galaxy Tab S9): `app/(tabs)/_layout.tsx` fija `tabBarStyle.height = 62` y
 * `paddingBottom = 8`. En `@react-navigation/bottom-tabs@7.18.0`, una altura
 * numérica explícita hace que `getTabBarHeight()` devuelva ese número **sin
 * sumar `insets.bottom`**, y el `tabBarStyle` del proyecto se fusiona *después*
 * del `paddingBottom: insets.bottom` que la barra aplica por su cuenta,
 * sobrescribiéndolo. Con edge-to-edge (Android 15 / Expo SDK 54) la ventana se
 * extiende bajo la barra de navegación del sistema, así que la barra de
 * pestañas queda dibujada debajo de ella e inaccesible al tacto.
 *
 * NOTA DE DISEÑO — por qué se prueba un resolver y no el render: el proyecto no
 * tiene `@testing-library/react-native` ni `react-test-renderer` instalados y
 * este spec no agrega dependencias (criterio de aceptación 10), igual que en el
 * spec 62 con `AppText`. Por eso toda la lógica de composición del estilo vive
 * en una función pura, y el layout solo la aplica.
 *
 * COBERTURA MANUAL, NO AUTOMÁTICA: la accesibilidad táctil real de las
 * pestañas (criterios 1 y 2), la ausencia de franja duplicada (5), el
 * diagnóstico del build del piloto (6) y todo el Hallazgo A —textos del header
 * completos con fuente por defecto y con fuente aumentada (7, 8), y escalado
 * libre de los textos de contenido (9)— dependen de ajustes del sistema
 * operativo sobre un binario nativo instalado en un dispositivo físico. Se
 * verifican en `docs/testing/test-067-layout-movil-header-tabmenu.md` y **no**
 * se simulan aquí: un test que los afirmara sin renderizar ni medir nada sería
 * una afirmación sin respaldo.
 */

import {
  TAB_BAR_CONTENT_HEIGHT,
  TAB_BAR_PADDING_BOTTOM,
  TAB_BAR_PADDING_TOP,
  resolveTabBarStyle,
} from "../lib/resolveTabBarStyle";
import { lightColors } from "../theme/colors";

/** Alto total histórico del tab bar, previo a este spec (62 dp). */
const LEGACY_TAB_BAR_HEIGHT =
  TAB_BAR_CONTENT_HEIGHT + TAB_BAR_PADDING_TOP + TAB_BAR_PADDING_BOTTOM;

/** Insets inferiores representativos: sin barra, gestos, y 3 botones. */
const NO_INSET = 0;
const GESTURE_INSET = 24;
const THREE_BUTTON_INSET = 48;

describe("resolveTabBarStyle — constantes de layout", () => {
  it("conserva el alto útil de contenido del diseño actual (48 dp)", () => {
    expect(TAB_BAR_CONTENT_HEIGHT).toBe(48);
  });

  it("conserva los paddings verticales del diseño actual", () => {
    expect(TAB_BAR_PADDING_TOP).toBe(6);
    expect(TAB_BAR_PADDING_BOTTOM).toBe(8);
  });

  it("las constantes reconstruyen el alto histórico de 62 dp", () => {
    expect(LEGACY_TAB_BAR_HEIGHT).toBe(62);
  });
});

describe("resolveTabBarStyle — criterio de aceptación 4 (sin regresión sin inset)", () => {
  it("en un dispositivo sin inset inferior devuelve exactamente el layout previo", () => {
    const style = resolveTabBarStyle({ bottomInset: NO_INSET, colors: lightColors });

    expect(style.height).toBe(LEGACY_TAB_BAR_HEIGHT);
    expect(style.paddingTop).toBe(TAB_BAR_PADDING_TOP);
    expect(style.paddingBottom).toBe(TAB_BAR_PADDING_BOTTOM);
  });
});

describe("resolveTabBarStyle — criterios de aceptación 1 y 2 (reserva del área segura)", () => {
  it("suma el inset de la barra de gestos al alto y al padding inferior", () => {
    const style = resolveTabBarStyle({ bottomInset: GESTURE_INSET, colors: lightColors });

    expect(style.height).toBe(LEGACY_TAB_BAR_HEIGHT + GESTURE_INSET);
    expect(style.paddingBottom).toBe(TAB_BAR_PADDING_BOTTOM + GESTURE_INSET);
  });

  it("suma el inset de la navegación de 3 botones, que es el caso del piloto", () => {
    const style = resolveTabBarStyle({ bottomInset: THREE_BUTTON_INSET, colors: lightColors });

    expect(style.height).toBe(LEGACY_TAB_BAR_HEIGHT + THREE_BUTTON_INSET);
    expect(style.paddingBottom).toBe(TAB_BAR_PADDING_BOTTOM + THREE_BUTTON_INSET);
  });

  it("el alto siempre deja espacio por encima del inset del sistema", () => {
    [NO_INSET, GESTURE_INSET, THREE_BUTTON_INSET, 64, 96].forEach((bottomInset) => {
      const style = resolveTabBarStyle({ bottomInset, colors: lightColors });

      // Si el alto no superara al inset, la barra entera quedaría bajo la
      // barra de navegación del sistema — que es exactamente el bug reportado.
      expect(Number(style.height)).toBeGreaterThan(bottomInset);
    });
  });

  it("el alto depende del inset y no es un número fijo", () => {
    // Guarda explícita contra el fix prohibido por el spec: subir la altura fija
    // a un número mayor reintroduce el bug en el siguiente dispositivo.
    const sinInset = resolveTabBarStyle({ bottomInset: NO_INSET, colors: lightColors });
    const conInset = resolveTabBarStyle({ bottomInset: THREE_BUTTON_INSET, colors: lightColors });

    expect(conInset.height).not.toBe(sinInset.height);
  });
});

describe("resolveTabBarStyle — criterio de aceptación 3 (el área táctil no se sacrifica)", () => {
  it("el alto útil de contenido se mantiene constante con cualquier inset", () => {
    [NO_INSET, GESTURE_INSET, THREE_BUTTON_INSET, 64, 96].forEach((bottomInset) => {
      const style = resolveTabBarStyle({ bottomInset, colors: lightColors });
      const contentHeight =
        Number(style.height) - Number(style.paddingTop) - Number(style.paddingBottom);

      expect(contentHeight).toBe(TAB_BAR_CONTENT_HEIGHT);
    });
  });
});

describe("resolveTabBarStyle — entradas defensivas", () => {
  it("trata un inset negativo como 0", () => {
    const style = resolveTabBarStyle({ bottomInset: -10, colors: lightColors });

    expect(style.height).toBe(LEGACY_TAB_BAR_HEIGHT);
    expect(style.paddingBottom).toBe(TAB_BAR_PADDING_BOTTOM);
  });

  it("trata un inset no numérico como 0 en vez de propagar NaN al estilo", () => {
    // `useSafeAreaInsets()` puede devolver 0/undefined antes de que el provider
    // mida la ventana; un NaN en `height` rompería el layout entero.
    const style = resolveTabBarStyle({
      bottomInset: Number.NaN,
      colors: lightColors,
    });

    expect(style.height).toBe(LEGACY_TAB_BAR_HEIGHT);
    expect(Number.isNaN(Number(style.paddingBottom))).toBe(false);
  });
});

describe("resolveTabBarStyle — presentación", () => {
  it("aplica los colores de superficie y borde del tema recibido", () => {
    const style = resolveTabBarStyle({ bottomInset: NO_INSET, colors: lightColors });

    expect(style.backgroundColor).toBe(lightColors.surface);
    expect(style.borderTopColor).toBe(lightColors.border);
    expect(style.borderTopWidth).toBe(1);
  });

  it("es una función pura: mismas entradas, mismo resultado", () => {
    const a = resolveTabBarStyle({ bottomInset: GESTURE_INSET, colors: lightColors });
    const b = resolveTabBarStyle({ bottomInset: GESTURE_INSET, colors: lightColors });

    expect(a).toEqual(b);
  });
});
