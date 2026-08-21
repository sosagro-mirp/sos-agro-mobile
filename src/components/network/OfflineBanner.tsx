import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSyncStatusStore } from "../../store/useSyncStatusStore";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

export const OfflineBanner: React.FC = () => {
  const isOnline = useSyncStatusStore((state) => state.isOnline);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (isOnline) {
    return null;
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        Sin conexión — los datos se guardarán localmente
      </Text>
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
