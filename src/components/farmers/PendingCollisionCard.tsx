import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import type { PendingCollisionEntry } from "../../storage/pendingCollisionStorage";

interface PendingCollisionCardProps {
  entry: PendingCollisionEntry;
  onContinue: (entry: PendingCollisionEntry) => void;
  onDiscard: (entry: PendingCollisionEntry) => void;
}

/**
 * Spec 68, Fase 10 — oferta de retomar un Registro cuya colisión de documento
 * quedó sin resolver (el encuestador salió del aviso con «Atrás»).
 */
export const PendingCollisionCard: React.FC<PendingCollisionCardProps> = ({
  entry,
  onContinue,
  onDiscard,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title}>Registro sin terminar</Text>
      <Text style={styles.body}>
        {entry.submittedName} · documento {entry.documentId} — el documento ya está registrado a
        nombre de otra persona y falta decidir qué hacer.
      </Text>
      <View style={styles.actions}>
        <Pressable
          style={styles.primary}
          onPress={() => onContinue(entry)}
          accessibilityRole="button"
          accessibilityLabel="Continuar el registro sin terminar"
        >
          <Text style={styles.primaryText}>Continuar</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={() => onDiscard(entry)}
          accessibilityRole="button"
          accessibilityLabel="Descartar el registro sin terminar"
        >
          <Text style={styles.secondaryText}>Descartar</Text>
        </Pressable>
      </View>
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginTop: 16,
      padding: 14,
      gap: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.warningFg,
      backgroundColor: colors.warningBg,
    },
    title: { fontSize: 14, fontFamily: Fonts.bold, color: colors.warningFg },
    body: { fontSize: 13, fontFamily: Fonts.regular, color: colors.warningFg },
    actions: { flexDirection: "row", gap: 10, marginTop: 4 },
    primary: {
      flex: 1,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 8,
      backgroundColor: colors.brand,
    },
    primaryText: { fontSize: 14, fontFamily: Fonts.bold, color: colors.surface },
    secondary: {
      flex: 1,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.warningFg,
    },
    secondaryText: { fontSize: 14, fontFamily: Fonts.bold, color: colors.warningFg },
  });
}
