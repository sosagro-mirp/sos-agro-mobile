import React, { useMemo } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import type { CampaignRender } from "../../types/campaign";

interface CampaignCardProps {
  campaign: CampaignRender;
  onPress: () => void;
}

export const CampaignCard: React.FC<CampaignCardProps> = ({
  campaign,
  onPress,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      android_ripple={{ color: colors.brandSubtleBg }}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      <View style={styles.accentBar} />
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={2}>
          {campaign.name}
        </Text>
        {campaign.description !== null && campaign.description.length > 0 && (
          <Text style={styles.description} numberOfLines={2}>
            {campaign.description}
          </Text>
        )}
        <View style={styles.footer}>
          <View style={styles.stepsBadge}>
            <Text style={styles.stepsText}>
              {campaign.steps.length}{" "}
              {campaign.steps.length === 1 ? "paso" : "pasos"}
            </Text>
          </View>
          {!campaign.isActive && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveText}>Inactiva</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: 10,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
      minHeight: 72,
    },
    cardPressed: {
      opacity: 0.85,
    },
    accentBar: {
      width: 4,
      backgroundColor: colors.brand,
    },
    content: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6,
    },
    name: {
      fontFamily: Fonts.semiBold,
      fontSize: 16,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    description: {
      fontFamily: Fonts.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 2,
    },
    stepsBadge: {
      backgroundColor: colors.brandSubtleBg,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
    },
    stepsText: {
      fontFamily: Fonts.medium,
      fontSize: 12,
      color: colors.brandSubtleFg,
    },
    inactiveBadge: {
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
    },
    inactiveText: {
      fontFamily: Fonts.medium,
      fontSize: 12,
      color: colors.textMuted,
    },
  });
}
