import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import type { InstrumentDraftAnswer, InstrumentOption } from "../../types/instrument";

interface Props {
  questionId: string;
  options: InstrumentOption[];
  value: string | undefined;
  otherText?: string;
  booleanValue?: boolean;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

export function SingleChoiceList({
  questionId,
  options,
  value,
  otherText,
  onChange,
}: Props): React.JSX.Element {
  const [otherFocused, setOtherFocused] = useState(false);

  function handlePress(option: InstrumentOption): void {
    if (option.isOther) {
      onChange({ questionId, optionId: option.optionId, otherText: otherText ?? "" });
    } else {
      onChange({ questionId, optionId: option.optionId, otherText: undefined });
    }
  }

  function handleOtherText(text: string): void {
    onChange({ questionId, optionId: value, otherText: text });
  }

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const selected = value === option.optionId;
        const showOtherInput = option.isOther === true && selected;
        return (
          <View key={option.optionId}>
            <TouchableOpacity
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
            {showOtherInput && (
              <TextInput
                style={[styles.otherInput, otherFocused && styles.otherInputFocused]}
                value={otherText ?? ""}
                onChangeText={handleOtherText}
                onFocus={() => setOtherFocused(true)}
                onBlur={() => setOtherFocused(false)}
                placeholder="Especifica aquí..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />
            )}
          </View>
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
  otherInput: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    lineHeight: 26,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 72,
    marginTop: 4,
  },
  otherInputFocused: {
    borderColor: "#1B6B3A",
  },
});
