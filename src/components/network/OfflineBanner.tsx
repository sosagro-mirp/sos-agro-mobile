import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSyncStatusStore } from "../../store/useSyncStatusStore";
import { Fonts } from "../../theme/fonts";

export const OfflineBanner: React.FC = () => {
  const isOnline = useSyncStatusStore((state) => state.isOnline);

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

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#FEF3C7",
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: "#92400E",
    textAlign: "center",
  },
});
