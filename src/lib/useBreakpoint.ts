import { useWindowDimensions } from "react-native";
import { resolveBreakpoint, TABLET_BREAKPOINT, type LayoutBreakpoint } from "./resolveBreakpoint";

/**
 * Hook de breakpoint — spec 74, Fase 10. Envuelve `resolveBreakpoint()` con
 * `useWindowDimensions()`, que ya reacciona a rotación y multi-ventana (no
 * requiere `expo-screen-orientation`, que este spec no puede instalar).
 *
 * `threshold` permite usar un umbral más exigente que el general
 * (`TABLET_BREAKPOINT`) para layouts de paneles fijos — ver
 * `INSTRUMENT_PANELS_MIN_WIDTH`/`LOTES_PANELS_MIN_WIDTH` en
 * `resolveBreakpoint.ts` (hallazgo TC-074-87).
 */
export function useBreakpoint(threshold: number = TABLET_BREAKPOINT): LayoutBreakpoint {
  const { width } = useWindowDimensions();
  return resolveBreakpoint(width, threshold);
}
