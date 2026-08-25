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
      <Text style={styles.text}>* REQUERIDO</Text>
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      marginBottom: 14,
    },
    text: {
      fontFamily: Fonts.extraBold,
      fontSize: 11,
      color: colors.dangerFg,
      letterSpacing: 0.4,
    },
  });
}
