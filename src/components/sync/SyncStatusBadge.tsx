import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSyncStatusStore } from "../../store/useSyncStatusStore";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

export const SyncStatusBadge: React.FC = () => {
  const pendingCount = useSyncStatusStore((state) => state.pendingCount);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (pendingCount === 0) {
    return null;
  }

  return (
    <View style={styles.badge}>
      <Text style={styles.count}>{pendingCount}</Text>
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    badge: {
      backgroundColor: colors.warningFg,
      borderRadius: 999,
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      alignItems: "center",
      justifyContent: "center",
    },
    count: {
      fontFamily: Fonts.bold,
      fontSize: 12,
      color: colors.surface,
      lineHeight: 16,
    },
  });
}
