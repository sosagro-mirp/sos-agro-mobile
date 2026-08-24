import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WifiOff } from "lucide-react-native";
import { AppText } from "./AppText";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

/**
 * Etiqueta para un control puntual deshabilitado por falta de red — nivel 3
 * de la jerarquía de conectividad de tres niveles (spec 74, deuda #4). Este
 * componente solo aporta la etiqueta; el control que la lleva debe atenuarse
 * (`opacity` ~0.6) por su propio llamador para leerse como deshabilitado.
 */
export function RequiresConnectionTag() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.tag}>
      <WifiOff size={11} color={colors.textMuted} />
      <AppText style={styles.text}>REQUIERE CONEXIÓN</AppText>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    tag: { flexDirection: "row", alignItems: "center", gap: 5 },
    text: { fontFamily: Fonts.bold, fontSize: 10, color: colors.textMuted },
  });
}
