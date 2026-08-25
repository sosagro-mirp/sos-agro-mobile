import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CircleUser, Workflow } from "lucide-react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

interface RespondentContextPanelProps {
  farmerName: string | null;
  instrumentName: string;
  conditionReason: string | null;
}

/**
 * Panel derecho del instrumento en tablet — spec 74, Fase 10. Contexto del
 * encuestado (a quién se le está aplicando el instrumento) y, cuando la
 * pregunta actual es condicional, la razón por la que apareció.
 */
export function RespondentContextPanel({
  farmerName,
  instrumentName,
  conditionReason,
}: RespondentContextPanelProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.panel}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <CircleUser size={15} color={colors.textMuted} strokeWidth={2.2} />
          <Text style={styles.cardLabel}>ENCUESTADO</Text>
        </View>
        <Text style={styles.farmerName} numberOfLines={2}>{farmerName ?? "Sin identificar"}</Text>
        <Text style={styles.instrumentName} numberOfLines={2}>{instrumentName}</Text>
      </View>

      {conditionReason ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Workflow size={15} color={colors.brandSubtleFg} strokeWidth={2.2} />
            <Text style={[styles.cardLabel, styles.conditionLabel]}>POR QUÉ APARECE</Text>
          </View>
          <Text style={styles.conditionText}>{conditionReason}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    panel: {
      width: 250,
      flexShrink: 0,
      backgroundColor: colors.surfaceMuted,
      borderLeftWidth: 1,
      borderLeftColor: colors.border,
      paddingHorizontal: 14,
      paddingTop: 16,
      gap: 12,
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      gap: 4,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 4,
    },
    cardLabel: {
      fontSize: 9.5,
      fontFamily: Fonts.extraBold,
      color: colors.textMuted,
      letterSpacing: 0.6,
    },
    conditionLabel: {
      color: colors.brandSubtleFg,
    },
    farmerName: {
      fontSize: 14,
      fontFamily: Fonts.bold,
      color: colors.textPrimary,
    },
    instrumentName: {
      fontSize: 11.5,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
    },
    conditionText: {
      fontSize: 12,
      fontFamily: Fonts.medium,
      color: colors.textPrimary,
      lineHeight: 17,
    },
  });
}
