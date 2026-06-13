import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSyncStatusStore } from "../../store/useSyncStatusStore";
import { Fonts } from "../../theme/fonts";

export const SyncStatusBadge: React.FC = () => {
  const pendingCount = useSyncStatusStore((state) => state.pendingCount);

  if (pendingCount === 0) {
    return null;
  }

  return (
    <View style={styles.badge}>
      <Text style={styles.count}>{pendingCount}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    backgroundColor: "#F59E0B",
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
    color: "#FFFFFF",
    lineHeight: 16,
  },
});
