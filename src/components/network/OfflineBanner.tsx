import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSyncStatusStore } from "../../store/useSyncStatusStore";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

export const OfflineBanner: React.FC = () => {
  const reachability = useSyncStatusStore((state) => state.reachability);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (reachability === 'online') {
    return null;
  }

  // Spec 81, Fase 4 — "sin conexión" (radio realmente caída) y "servidor
  // inalcanzable" (hay red, pero el backend no responde) son mensajes
  // distintos a propósito: el primero manda a buscar señal, el segundo no
  // debería.
  const text =
    reachability === 'server_unreachable'
      ? 'No pudimos contactar el servidor — los datos se guardarán localmente'
      : 'Sin conexión — los datos se guardarán localmente';

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      backgroundColor: colors.warningBg,
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    text: {
      fontFamily: Fonts.medium,
      fontSize: 14,
      color: colors.warningFg,
      textAlign: "center",
    },
  });
}
