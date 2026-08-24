import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { AppText } from "./AppText";
import { SecondaryButton } from "./SecondaryButton";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Plantilla única de estado vacío — spec 74, Fase 1 (deuda #6). Mismo
 * contenedor de 60 px, ícono lucide de 26 px, título 15–16/800 y explicación
 * de 12.5 px en las cinco pantallas que hoy tienen su propio espaciado.
 */
export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <Icon size={26} color={colors.textMuted} strokeWidth={1.8} />
      </View>
      <AppText style={styles.title}>{title}</AppText>
      <AppText style={styles.description}>{description}</AppText>
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <SecondaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      alignItems: "center",
      paddingVertical: 56,
      paddingHorizontal: 20,
    },
    iconWrapper: {
      width: 60,
      height: 60,
      borderRadius: 16,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 18,
    },
    title: {
      fontSize: 16,
      fontFamily: Fonts.bold,
      color: colors.textPrimary,
      marginBottom: 8,
      textAlign: "center",
    },
    description: {
      fontSize: 12.5,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      lineHeight: 19,
      textAlign: "center",
    },
    action: {
      marginTop: 20,
      width: "100%",
      maxWidth: 260,
    },
  });
}
