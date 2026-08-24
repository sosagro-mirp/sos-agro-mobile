import React, { useMemo } from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

interface SecondaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export const SecondaryButton: React.FC<SecondaryButtonProps> = ({
  label,
  onPress,
  disabled = false,
  loading = false,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[styles.button, isDisabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={isDisabled ? colors.borderStrong : colors.brand}
          size="small"
        />
      ) : (
        <Text style={[styles.label, isDisabled && styles.labelDisabled]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: {
      width: "100%",
      minHeight: 56,
      backgroundColor: "transparent",
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    buttonDisabled: {
      borderColor: colors.borderStrong,
    },
    label: {
      fontFamily: Fonts.semiBold,
      fontSize: 18,
      color: colors.brand,
      textAlign: "center",
    },
    labelDisabled: {
      color: colors.borderStrong,
    },
  });
}
