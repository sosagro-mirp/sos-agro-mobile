/**
 * Breakpoint de tablet — spec 74, Fase 10. Función pura, sin dependencias:
 * la UI (`useBreakpoint`) es el único punto que la envuelve con
 * `useWindowDimensions`, para no duplicar el umbral en cada pantalla.
 */

export type LayoutBreakpoint = "phone" | "tablet";

// ≥ 720 dp lógicos — umbral general fijado por el spec 74 (Fase 10):
// clasifica el dispositivo como "de tipo tablet", pero NO garantiza que
// alcance para los layouts de paneles fijos (ver los dos umbrales de abajo).
export const TABLET_BREAKPOINT = 720;

// Hallazgo TC-074-87: una tablet en portrait puede tener ~800dp de ancho —
// "tablet" por TABLET_BREAKPOINT, pero angosta para el panel izquierdo
// (280) + columna de lectura mínima legible (~400) + panel derecho (250)
// del instrumento sin comprimirlos. Umbral propio, más exigente.
export const INSTRUMENT_PANELS_MIN_WIDTH = 930;

// Ídem para Lotes: croquis "panel" (380) + lista de vértices (310) + margen.
export const LOTES_PANELS_MIN_WIDTH = 760;

export function resolveBreakpoint(width: number, threshold: number = TABLET_BREAKPOINT): LayoutBreakpoint {
  return width >= threshold ? "tablet" : "phone";
}
