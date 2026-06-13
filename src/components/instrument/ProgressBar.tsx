import React from "react";
import { View, Text, StyleSheet, type DimensionValue } from "react-native";
import { Fonts } from "../../theme/fonts";

interface ProgressBarProps {
  current: number;
  total: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
  const progress = total > 0 ? Math.min(current / total, 1) : 0;
  const progressPercent = `${Math.round(progress * 100)}%`;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        Pregunta {current} de {total}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: progressPercent as DimensionValue }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: "#374151",
    marginBottom: 8,
  },
  track: {
    width: "100%",
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: 6,
    backgroundColor: "#1B6B3A",
    borderRadius: 3,
  },
});
