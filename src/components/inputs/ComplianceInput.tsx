import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import type { InstrumentDraftAnswer, InstrumentOption } from "../../types/instrument";

interface Props {
  questionId: string;
  options: InstrumentOption[];
  value: string | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

const COMPLIANCE_COLORS = [
  { bg: "#F0FDF4", border: "#16A34A", indicator: "#16A34A" }, // index 0 — compliant
  { bg: "#FFFBEB", border: "#D97706", indicator: "#D97706" }, // index 1 — partial
  { bg: "#FEF2F2", border: "#DC2626", indicator: "#DC2626" }, // index 2+ — non-compliant
];

function getComplianceColor(index: number): (typeof COMPLIANCE_COLORS)[number] {
  if (index === 0) return COMPLIANCE_COLORS[0]!;
  if (index === 1) return COMPLIANCE_COLORS[1]!;
  return COMPLIANCE_COLORS[2]!;
}

export function ComplianceInput({
  questionId,
  options,
  value,
  onChange,
}: Props): React.JSX.Element {
  function handlePress(option: InstrumentOption): void {
    onChange({ questionId, optionId: option.optionId });
  }

  return (
    <View style={styles.container}>
      {options.map((option, index) => {
        const selected = value === option.optionId;
        const colors = getComplianceColor(index);
        return (
          <TouchableOpacity
            key={option.optionId}
            style={[
              styles.row,
              selected
                ? {
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                    borderLeftWidth: 6,
                    borderLeftColor: colors.indicator,
                  }
                : styles.rowUnselected,
            ]}
            onPress={() => handlePress(option)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
          >
            <View
              style={[
                styles.indicator,
                { backgroundColor: selected ? colors.indicator : "#D1D5DB" },
              ]}
            />
            <View style={[styles.radio, selected && { borderColor: colors.border }]}>
              {selected && (
                <View style={[styles.radioDot, { backgroundColor: colors.border }]} />
              )}
            </View>
            <Text
              style={[
                styles.label,
                selected && { fontFamily: Fonts.semiBold, color: "#111827" },
              ]}
            >
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
    borderWidth: 2,
    borderRadius: 12,
    gap: 12,
  },
  rowUnselected: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
  },
  indicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    flexShrink: 0,
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
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  label: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    lineHeight: 24,
    color: "#374151",
    flex: 1,
  },
});
