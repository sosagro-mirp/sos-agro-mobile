import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WifiOff } from "lucide-react-native";
import { AppText } from "./AppText";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

interface OfflineNoticeProps {
  message: string;
}

/**
 * Banner ámbar de pantalla — nivel 2 de la jerarquía de conectividad de tres
 * niveles (spec 74, deuda #4): la píldora del header cubre el nivel 1
 * (estado permanente); este banner solo aparece cuando la falta de red
 * limita algo concreto de la pantalla actual; `RequiresConnectionTag` cubre
 * el nivel 3 (control puntual deshabilitado). Nunca los tres a la vez para
 * el mismo hecho.
 */
export function OfflineNotice({ message }: OfflineNoticeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.banner}>
      <WifiOff size={16} color={colors.warningFg} style={styles.icon} />
      <AppText style={styles.text}>{message}</AppText>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: colors.warningBg,
      borderWidth: 1,
      borderColor: colors.warningFg,
      borderRadius: 10,
      padding: 12,
    },
    icon: { marginTop: 1, flexShrink: 0 },
    text: {
      flex: 1,
      fontFamily: Fonts.medium,
      fontSize: 12,
      color: colors.warningFg,
      lineHeight: 18,
    },
  });
}
