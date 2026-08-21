import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Appearance } from "react-native";
import { themeStorage } from "../storage/themeStorage";
import { logger } from "../lib/logger";
import { getColors, type ThemeColors } from "./colors";
import { nextPreference, resolveEffectiveTheme, type EffectiveTheme, type ThemePreference } from "./resolveTheme";

interface ThemeContextValue {
  preference: ThemePreference;
  effectiveTheme: EffectiveTheme;
  colors: ThemeColors;
  setPreference: (preference: ThemePreference) => void;
  cyclePreference: () => void;
  /** true cuando la preferencia guardada ya se leyó de storage. */
  restored: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [deviceScheme, setDeviceScheme] = useState(Appearance.getColorScheme() ?? null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    themeStorage.getPreference().then((stored) => {
      if (!cancelled) {
        setPreferenceState(stored);
        setRestored(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setDeviceScheme(colorScheme ?? null);
    });
    return () => subscription.remove();
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    themeStorage.setPreference(next).catch((err) =>
      logger.error("[ThemeProvider] setPreference failed", err),
    );
  };

  const cyclePreference = () => setPreference(nextPreference(preference));

  const effectiveTheme = resolveEffectiveTheme(preference, deviceScheme);
  const colors = getColors(effectiveTheme);

  const value: ThemeContextValue = { preference, effectiveTheme, colors, setPreference, cyclePreference, restored };

  // NUNCA devolver null aquí mientras se restaura la preferencia: desmontar y
  // volver a montar a los hijos (todo el árbol de expo-router) dispara en
  // Samsung One UI 7 / Android 15 un reset nativo del contenedor de navegación
  // que remonta el RootLayout completo en bucle infinito (~30 veces/segundo) y
  // deja la app en pantalla blanca antes del login, con crashes por
  // TransactionTooLargeException al pasar a background (Sentry REACT-NATIVE-3,
  // 5, 6 y 7 — incidente del 2026-08-18 en Tab S9). El anti-parpadeo
  // claro→oscuro se logra sin desmontar nada: el RootLayout mantiene el splash
  // visible hasta que `restored` sea true (ver SplashGate en app/_layout.tsx).

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  }
  return context;
}
