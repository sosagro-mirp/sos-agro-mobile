import React, { useMemo } from "react";
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Moon, Monitor, Sun } from "lucide-react-native";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import type { ThemePreference } from "../../theme/resolveTheme";

const ICON_BY_PREFERENCE = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

const ACCESSIBILITY_LABEL_BY_PREFERENCE: Record<ThemePreference, string> = {
  light: "Tema claro activo. Cambiar a oscuro.",
  dark: "Tema oscuro activo. Cambiar a sistema.",
  system: "Tema según el sistema activo. Cambiar a claro.",
};

const SEGMENTED_LABEL_BY_PREFERENCE: Record<ThemePreference, string> = {
  light: "Tema claro",
  dark: "Tema oscuro",
  system: "Tema según el sistema",
};

const PREFERENCES: ThemePreference[] = ["light", "dark", "system"];

interface ThemeToggleProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
  color?: string;
  /**
   * `icon` (default): botón único que cicla las tres preferencias — el
   * usado en el header de la app. `segmented` (spec 74, Fase 2): las tres
   * opciones visibles a la vez, cada una elegible directamente — usado en
   * login, donde el encuestador puede llegar con el sol de frente y
   * necesita pasar a claro antes de escribir la contraseña, sin tener que
   * adivinar cuántos toques le faltan al ciclo.
   */
  variant?: "icon" | "segmented";
}

export function ThemeToggle({ size = 20, style, color, variant = "icon" }: ThemeToggleProps) {
  const { preference, colors, cyclePreference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (variant === "segmented") {
    return (
      <View style={[styles.segmentedPill, style]}>
        {PREFERENCES.map((pref) => {
          const Icon = ICON_BY_PREFERENCE[pref];
          const active = pref === preference;
          return (
            <Pressable
              key={pref}
              onPress={() => setPreference(pref)}
              accessibilityRole="button"
              accessibilityLabel={SEGMENTED_LABEL_BY_PREFERENCE[pref]}
              accessibilityState={{ selected: active }}
              hitSlop={4}
              style={[styles.segmentedItem, active && styles.segmentedItemActive]}
            >
              <Icon size={size} color={active ? colors.headerBg : colors.headerFg} />
            </Pressable>
          );
        })}
      </View>
    );
  }

  const Icon = ICON_BY_PREFERENCE[preference];

  return (
    <Pressable
      onPress={cyclePreference}
      accessibilityRole="button"
      accessibilityLabel={ACCESSIBILITY_LABEL_BY_PREFERENCE[preference]}
      hitSlop={8}
      style={style}
    >
      <Icon size={size} color={color ?? colors.textPrimary} />
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    segmentedPill: {
      flexDirection: "row",
      gap: 2,
      backgroundColor: colors.headerPill,
      borderWidth: 1,
      borderColor: colors.headerBorder,
      borderRadius: 99,
      padding: 3,
    },
    segmentedItem: {
      width: 32,
      height: 32,
      borderRadius: 99,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentedItemActive: {
      backgroundColor: colors.headerFg,
    },
  });
}
