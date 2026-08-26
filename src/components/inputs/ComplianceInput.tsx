import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Check } from "lucide-react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import type { InstrumentDraftAnswer, InstrumentOption } from "../../types/instrument";

interface Props {
  questionId: string;
  options: InstrumentOption[];
  value: string | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

function getComplianceColors(themeColors: ThemeColors) {
  return [
    { bg: themeColors.successBg, border: themeColors.successFg, indicator: themeColors.successFg }, // index 0 — compliant
    { bg: themeColors.warningBg, border: themeColors.warningFg, indicator: themeColors.warningFg }, // index 1 — partial
    { bg: themeColors.dangerBg, border: themeColors.dangerFg, indicator: themeColors.dangerFg }, // index 2+ — non-compliant
  ];
}

function pickComplianceColor(
  palette: ReturnType<typeof getComplianceColors>,
  index: number,
): (typeof palette)[number] {
  if (index === 0) return palette[0]!;
  if (index === 1) return palette[1]!;
  return palette[2]!;
}

export function ComplianceInput({
  questionId,
  options,
  value,
  onChange,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const compliancePalette = useMemo(() => getComplianceColors(colors), [colors]);

  function handlePress(option: InstrumentOption): void {
    onChange({ questionId, optionId: option.optionId });
  }

  return (
    <View style={styles.container}>
      {options.map((option, index) => {
        const selected = value === option.optionId;
        const complianceColor = pickComplianceColor(compliancePalette, index);
        return (
          <TouchableOpacity
            key={option.optionId}
            style={[
              styles.row,
              selected
                ? {
                    backgroundColor: complianceColor.bg,
                    borderColor: complianceColor.border,
                    borderLeftWidth: 6,
                    borderLeftColor: complianceColor.indicator,
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
                { backgroundColor: selected ? complianceColor.indicator : colors.borderStrong },
              ]}
            />
            <Text
              style={[
                styles.label,
                selected && { fontFamily: Fonts.bold, color: colors.textPrimary },
              ]}
            >
              {option.text}
            </Text>
            <View style={[styles.radio, selected && { borderColor: complianceColor.border }]}>
              {selected && (
                <Check size={13} color={complianceColor.border} strokeWidth={3.4} />
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      width: "100%",
      gap: 8,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 56,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderRadius: 11,
      gap: 13,
    },
    rowUnselected: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    indicator: {
      width: 13,
      height: 13,
      borderRadius: 7,
      flexShrink: 0,
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
    label: {
      fontFamily: Fonts.medium,
      fontSize: 14.5,
      lineHeight: 20,
      color: colors.textPrimary,
      flex: 1,
    },
  });
}
