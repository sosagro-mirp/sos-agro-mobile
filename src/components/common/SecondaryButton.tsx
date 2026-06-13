import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Fonts } from "../../theme/fonts";

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
          color={isDisabled ? "#D1D5DB" : "#1B6B3A"}
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

const styles = StyleSheet.create({
  button: {
    width: "100%",
    minHeight: 56,
    backgroundColor: "transparent",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#1B6B3A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    borderColor: "#D1D5DB",
  },
  label: {
    fontFamily: Fonts.semiBold,
    fontSize: 18,
    color: "#1B6B3A",
    textAlign: "center",
  },
  labelDisabled: {
    color: "#D1D5DB",
  },
});
