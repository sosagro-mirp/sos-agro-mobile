import type { ThemeColors } from "../theme/colors";

/**
 * Alto útil de contenido del tab bar (icono + etiqueta). Invariante: la
 * corrección del safe area SUMA el inset del sistema a este valor, nunca lo
 * resta — ver spec 67, criterio de aceptación 3.
 */
export const TAB_BAR_CONTENT_HEIGHT = 48;

/** Padding superior visual del tab bar. No cambia con el inset. */
export const TAB_BAR_PADDING_TOP = 6;

/**
 * Padding horizontal del tab bar — mismo valor que el resto de la app
 * (header y listas de todas las pestañas usan 20 px). Sin esto, los ítems de
 * la barra quedaban pegados al borde de la pantalla mientras el resto del
 * contenido respeta ese margen, y la barra se leía desalineada (hallazgo de
 * la ronda manual de la Fase 3, 2026-08-25).
 */
export const TAB_BAR_PADDING_HORIZONTAL = 20;

/**
 * Padding inferior visual del tab bar, antes de sumar el inset del sistema.
 * Es el valor histórico (spec 67, hallazgo B): el proyecto lo fijaba como
 * único padding inferior, sobrescribiendo el que `@react-navigation/bottom-tabs`
 * calcula a partir de `useSafeAreaInsets()`.
 */
export const TAB_BAR_PADDING_BOTTOM = 8;

export interface ResolveTabBarStyleParams {
  /** `insets.bottom` de `useSafeAreaInsets()`. Puede ser 0, NaN o negativo
   * en el primer render antes de que el provider mida la ventana. */
  bottomInset: number;
  colors: ThemeColors;
}

export interface TabBarStyle {
  height: number;
  paddingTop: number;
  paddingBottom: number;
  paddingHorizontal: number;
  backgroundColor: string;
  borderTopColor: string;
  borderTopWidth: number;
}

/**
 * Compone el estilo del tab bar reservando el área segura inferior del
 * sistema (barra de navegación o gestos), sin sacrificar el alto útil de
 * contenido. Función pura — el proyecto no tiene `@testing-library/react-native`
 * ni `react-test-renderer` para probar un render (spec 62, mismo patrón que
 * `AppText`).
 *
 * Antes de este spec, `tabBarStyle` fijaba `height: 62, paddingBottom: 8` como
 * números absolutos. En `@react-navigation/bottom-tabs@7.18.0`, una altura
 * numérica explícita hace que `getTabBarHeight()` la devuelva tal cual sin
 * sumar `insets.bottom`, y el `paddingBottom` fijo sobrescribe el que la
 * barra aplica por su cuenta — con edge-to-edge (Android 15 / Expo SDK 54) la
 * barra queda dibujada bajo la barra de navegación del sistema, inaccesible
 * al tacto (spec 67, hallazgo B).
 */
export function resolveTabBarStyle({
  bottomInset,
  colors,
}: ResolveTabBarStyleParams): TabBarStyle {
  const safeInset =
    typeof bottomInset === "number" && Number.isFinite(bottomInset) && bottomInset > 0
      ? bottomInset
      : 0;

  return {
    height: TAB_BAR_CONTENT_HEIGHT + TAB_BAR_PADDING_TOP + TAB_BAR_PADDING_BOTTOM + safeInset,
    paddingTop: TAB_BAR_PADDING_TOP,
    paddingBottom: TAB_BAR_PADDING_BOTTOM + safeInset,
    paddingHorizontal: TAB_BAR_PADDING_HORIZONTAL,
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  };
}
