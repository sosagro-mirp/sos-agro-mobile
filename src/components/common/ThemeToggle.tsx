import React from "react";
import { Pressable, StyleProp, ViewStyle } from "react-native";
import { Moon, Monitor, Sun } from "lucide-react-native";
import { useTheme } from "../../theme/ThemeProvider";
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

interface ThemeToggleProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
  color?: string;
}

export function ThemeToggle({ size = 20, style, color }: ThemeToggleProps) {
  const { preference, colors, cyclePreference } = useTheme();
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
