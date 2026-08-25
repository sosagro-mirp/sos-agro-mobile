import { useWindowDimensions } from "react-native";
import { resolveBreakpoint, type LayoutBreakpoint } from "./resolveBreakpoint";

/**
 * Hook de breakpoint — spec 74, Fase 10. Envuelve `resolveBreakpoint()` con
 * `useWindowDimensions()`, que ya reacciona a rotación y multi-ventana (no
 * requiere `expo-screen-orientation`, que este spec no puede instalar).
 */
export function useBreakpoint(): LayoutBreakpoint {
  const { width } = useWindowDimensions();
  return resolveBreakpoint(width);
}
