import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import type { InstrumentDraftAnswer, InstrumentOption } from "../../types/instrument";

interface Props {
  questionId: string;
  options: InstrumentOption[];
  selectedIds: string[];
  otherText: string | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

export function MultipleChoiceList({
  questionId,
  options,
  selectedIds,
  otherText,
  onChange,
}: Props): React.JSX.Element {
  const [otherFocused, setOtherFocused] = useState(false);

  function handleToggle(option: InstrumentOption): void {
    const isSelected = selectedIds.includes(option.optionId);
    let newIds: string[];
    if (isSelected) {
      newIds = selectedIds.filter((id) => id !== option.optionId);
    } else {
      newIds = [...selectedIds, option.optionId];
    }

    const hasOtherSelected = options
      .filter((o) => o.isOther)
      .some((o) => newIds.includes(o.optionId));

    onChange({
      questionId,
      optionIds: newIds,
      otherText: hasOtherSelected ? (otherText ?? "") : undefined,
    });
  }

  function handleOtherText(text: string): void {
    onChange({ questionId, optionIds: selectedIds, otherText: text });
  }

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const selected = selectedIds.includes(option.optionId);
        const showOtherInput = option.isOther === true && selected;
        return (
          <View key={option.optionId}>
            <TouchableOpacity
              style={[styles.row, selected && styles.rowSelected]}
              onPress={() => handleToggle(option)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
            >
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected && <Text style={styles.checkmark}>✓</Text>}
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
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxSelected: {
    borderColor: "#1B6B3A",
    backgroundColor: "#1B6B3A",
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: Fonts.bold,
    lineHeight: 18,
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
