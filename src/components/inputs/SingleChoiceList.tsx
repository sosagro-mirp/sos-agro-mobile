import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import type { InstrumentDraftAnswer, InstrumentOption } from "../../types/instrument";

interface Props {
  questionId: string;
  options: InstrumentOption[];
  value: string | undefined;
  booleanValue?: boolean;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

export function SingleChoiceList({
  questionId,
  options,
  value,
  onChange,
}: Props): React.JSX.Element {
  function handlePress(option: InstrumentOption): void {
    const isYesNo = typeof option.value === "boolean";
    if (isYesNo) {
      onChange({
        questionId,
        optionId: option.optionId,
        booleanValue: option.value === true,
      });
    } else {
      onChange({ questionId, optionId: option.optionId });
    }
  }

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const selected = value === option.optionId;
        return (
          <TouchableOpacity
            key={option.optionId}
            style={[styles.row, selected && styles.rowSelected]}
            onPress={() => handlePress(option)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
          >
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected && <View style={styles.radioDot} />}
            </View>
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {option.text}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    gap: 14,
  },
  rowSelected: {
    borderLeftWidth: 4,
    borderLeftColor: "#1B6B3A",
    borderColor: "#1B6B3A",
    backgroundColor: "#F0FDF4",
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: "#1B6B3A",
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#1B6B3A",
  },
  label: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    lineHeight: 24,
    color: "#374151",
    flex: 1,
  },
  labelSelected: {
    fontFamily: Fonts.semiBold,
    color: "#14532D",
  },
});
