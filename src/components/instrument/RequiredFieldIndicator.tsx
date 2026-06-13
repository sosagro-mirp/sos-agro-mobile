import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Fonts } from "../../theme/fonts";

interface RequiredFieldIndicatorProps {
  required: boolean;
}

export const RequiredFieldIndicator: React.FC<RequiredFieldIndicatorProps> = ({
  required,
}) => {
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

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  asterisk: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: "#DC2626",
    lineHeight: 18,
  },
  text: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#DC2626",
    lineHeight: 18,
  },
});
