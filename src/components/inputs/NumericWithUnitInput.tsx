import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
          placeholderTextColor={colors.textMuted}
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      width: "100%",
      gap: 24,
    },
    section: {
      gap: 8,
    },
    sectionLabel: {
      fontFamily: Fonts.bold,
      fontSize: 11.5,
      color: colors.textMuted,
      letterSpacing: 0.4,
    },
    numericInput: {
      fontFamily: Fonts.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 0,
      height: 48,
      minHeight: 48,
    },
    numericInputFocused: {
      borderColor: colors.brand,
    },
    unitList: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 11,
      overflow: "hidden",
    },
    unitOption: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 56,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    unitOptionSelected: {
      backgroundColor: colors.brandSubtleBg,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.textMuted,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    radioSelected: {
      borderColor: colors.brand,
    },
    radioDot: {
      width: 11,
      height: 11,
      borderRadius: 6,
      backgroundColor: colors.brand,
    },
    unitLabel: {
      fontFamily: Fonts.medium,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textPrimary,
      flex: 1,
    },
    unitLabelSelected: {
      fontFamily: Fonts.bold,
      color: colors.brandSubtleFg,
    },
  });
}
