/**
 * Breakpoint de tablet — spec 74, Fase 10. Función pura, sin dependencias:
 * la UI (`useBreakpoint`) es el único punto que la envuelve con
 * `useWindowDimensions`, para no duplicar el umbral en cada pantalla.
 */

export type LayoutBreakpoint = "phone" | "tablet";

// ≥ 720 dp lógicos — umbral fijado por el spec 74 (Fase 10).
export const TABLET_BREAKPOINT = 720;

export function resolveBreakpoint(width: number): LayoutBreakpoint {
  return width >= TABLET_BREAKPOINT ? "tablet" : "phone";
}
