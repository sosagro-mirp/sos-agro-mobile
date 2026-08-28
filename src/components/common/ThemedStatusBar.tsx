import { StatusBar } from "expo-status-bar";
import { useTheme } from "../../theme/ThemeProvider";

/**
 * Spec 76, Fase 1: `expo-status-bar` ya era dependencia pero no se usaba en
 * ninguna pantalla, así que la barra de estado seguía el estilo por defecto
 * del sistema en vez del tema efectivo de la app. Componente hoja: nunca
 * envuelve `children`, para no reintroducir ningún desmontaje del árbol (ver
 * el comentario de ThemeProvider.tsx sobre el bucle de remontaje).
 */
export function ThemedStatusBar() {
  const { effectiveTheme } = useTheme();

  return <StatusBar style={effectiveTheme === "dark" ? "light" : "dark"} />;
}
