import React from "react";
import { View, Text, StyleSheet, type DimensionValue } from "react-native";
import { Fonts } from "../../theme/fonts";

interface CampaignProgressProps {
  completedCount: number;
  totalSteps: number;
  campaignName: string;
}

export const CampaignProgress: React.FC<CampaignProgressProps> = ({
  completedCount,
  totalSteps,
  campaignName,
}) => {
  const progress =
    totalSteps > 0 ? Math.min(completedCount / totalSteps, 1) : 0;
  const progressPercent = `${Math.round(progress * 100)}%`;

  return (
    <View style={styles.container}>
      <Text style={styles.campaignName} numberOfLines={1}>
        {campaignName}
      </Text>
      <Text style={styles.stepLabel}>
        Paso {completedCount} de {totalSteps}
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
    gap: 6,
  },
  campaignName: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  stepLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: "#111827",
    lineHeight: 22,
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
