import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

interface RequiredFieldIndicatorProps {
  required: boolean;
}

export const RequiredFieldIndicator: React.FC<RequiredFieldIndicatorProps> = ({
  required,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!required) {
    return null;
  }

  return (
    <View style={styles.row}>
      <Text style={styles.asterisk}>*</Text>
      <Text style={styles.text}>Requerido</Text>
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    asterisk: {
      fontFamily: Fonts.bold,
      fontSize: 13,
      color: colors.dangerFg,
      lineHeight: 18,
    },
    text: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: colors.dangerFg,
      lineHeight: 18,
    },
  });
}
