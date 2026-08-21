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

  const value: ThemeContextValue = { preference, effectiveTheme, colors, setPreference, cyclePreference };

  // Evita un flash claro→oscuro: no monta a los hijos hasta restaurar la
  // preferencia guardada (equivalente móvil del script anti-FOUC de la web).
  if (!restored) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  }
  return context;
}
