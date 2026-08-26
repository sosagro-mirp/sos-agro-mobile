import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { AppText } from "./AppText";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

interface DestructiveButtonProps {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  loading?: boolean;
  /** Variante compacta para usar junto a una acción neutra en un header de sección. */
  compact?: boolean;
}

/**
 * Toda acción destructiva es un contenedor: borde rojo, fondo `dangerBg`,
 * ícono + label — spec 74, Fase 1 (deuda #7). Nunca vuelve a ser texto rojo
 * suelto al mismo nivel visual que una acción neutra.
 */
export function DestructiveButton({
  label,
  onPress,
  icon: Icon,
  disabled = false,
  loading = false,
  compact = false,
}: DestructiveButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[styles.button, isDisabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.dangerFg} />
      ) : (
        <>
          {Icon ? <Icon size={compact ? 15 : 17} color={colors.dangerFg} /> : null}
          <AppText style={styles.label}>{label}</AppText>
        </>
      )}
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors, compact: boolean) {
  return StyleSheet.create({
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      minHeight: 48,
      borderRadius: compact ? 8 : 10,
      borderWidth: 1,
      borderColor: colors.dangerFg,
      backgroundColor: colors.dangerBg,
      paddingHorizontal: compact ? 12 : 16,
    },
    buttonDisabled: { opacity: 0.5 },
    label: {
      fontFamily: Fonts.semiBold,
      fontSize: compact ? 13 : 14,
      color: colors.dangerFg,
    },
  });
}
