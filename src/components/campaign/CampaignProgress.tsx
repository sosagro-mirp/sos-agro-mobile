import React, { useMemo } from "react";
import { View, Text, StyleSheet, type DimensionValue } from "react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      width: "100%",
      gap: 6,
    },
    campaignName: {
      fontFamily: Fonts.medium,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 18,
    },
    stepLabel: {
      fontFamily: Fonts.semiBold,
      fontSize: 16,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    track: {
      width: "100%",
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: "hidden",
    },
    fill: {
      height: 6,
      backgroundColor: colors.brand,
      borderRadius: 3,
    },
  });
}
