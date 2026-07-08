import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import type { InstrumentDraftAnswer, InstrumentOption } from "../../types/instrument";

interface Props {
  questionId: string;
  numericValue: number | undefined;
  selectedUnitId: string | undefined;
  units: InstrumentOption[];
  onChange: (answer: InstrumentDraftAnswer) => void;
}

export function NumericWithUnitInput({
  questionId,
  numericValue,
  selectedUnitId,
  units,
  onChange,
}: Props): React.JSX.Element {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState<string>(numericValue !== undefined ? String(numericValue) : "");

  function handleNumericChange(text: string): void {
    setRaw(text);
    if (text === "" || text === "-") {
      onChange({ questionId, optionId: selectedUnitId });
      return;
    }
    const parsed = parseFloat(text);
    if (!isNaN(parsed)) {
      onChange({ questionId, numericValue: parsed, optionId: selectedUnitId });
    } else {
      onChange({ questionId, optionId: selectedUnitId });
    }
  }

  function handleUnitSelect(unitId: string): void {
    onChange({ questionId, numericValue, optionId: unitId });
  }

  const selectedUnit = units.find((u) => u.optionId === selectedUnitId);

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Valor</Text>
        <TextInput
          style={[styles.numericInput, focused && styles.numericInputFocused]}
          value={raw}
          onChangeText={handleNumericChange}
          keyboardType="decimal-pad"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor="#9CA3AF"
          placeholder="0"
          returnKeyType="done"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Unidad</Text>
        <View style={styles.unitList}>
          {units.map((unit) => {
            const selected = selectedUnitId === unit.optionId;
            return (
              <TouchableOpacity
                key={unit.optionId}
                style={[styles.unitOption, selected && styles.unitOptionSelected]}
                onPress={() => handleUnitSelect(unit.optionId)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.unitLabel, selected && styles.unitLabelSelected]}>
                  {unit.text}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: 24,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: "#374151",
  },
  numericInput: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    lineHeight: 26,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 0,
    height: 56,
    minHeight: 56,
  },
  numericInputFocused: {
    borderColor: "#1B6B3A",
  },
  unitList: {
    gap: 8,
  },
  unitOption: {
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
  unitOptionSelected: {
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
  unitLabel: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    lineHeight: 24,
    color: "#374151",
    flex: 1,
  },
  unitLabelSelected: {
    fontFamily: Fonts.semiBold,
    color: "#14532D",
  },
});
