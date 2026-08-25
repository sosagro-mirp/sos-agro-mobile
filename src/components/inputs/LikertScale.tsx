import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import type { InstrumentDraftAnswer, InstrumentOption } from "../../types/instrument";
import { SingleChoiceList } from "./SingleChoiceList";

interface Props {
  questionId: string;
  options: InstrumentOption[];
  value: string | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

export function LikertScale({
  questionId,
  options,
  value,
  onChange,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (options.length > 7) {
    return (
      <SingleChoiceList
        questionId={questionId}
        options={options}
        value={value}
        onChange={onChange}
      />
    );
  }

  function handlePress(option: InstrumentOption): void {
    onChange({ questionId, optionId: option.optionId });
  }

  const firstLabel = options[0]?.text ?? "";
  const lastLabel = options[options.length - 1]?.text ?? "";

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        {options.map((option) => {
          const selected = value === option.optionId;
          return (
            <TouchableOpacity
              key={option.optionId}
              style={[styles.circle, selected && styles.circleSelected]}
              onPress={() => handlePress(option)}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.text}
            >
              {selected && <View style={styles.circleDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.labelsRow}>
        <Text style={styles.edgeLabel} numberOfLines={2}>
          {firstLabel}
        </Text>
        <Text style={[styles.edgeLabel, styles.edgeLabelRight]} numberOfLines={2}>
          {lastLabel}
        </Text>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      width: "100%",
      gap: 12,
    },
    track: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 40,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 4,
    },
    circle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: colors.textMuted,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    circleSelected: {
      borderColor: colors.brand,
      backgroundColor: colors.brand,
    },
    circleDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.brandForeground,
    },
    labelsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 4,
    },
    edgeLabel: {
      fontFamily: Fonts.medium,
      fontSize: 11.5,
      lineHeight: 15,
      color: colors.textMuted,
      maxWidth: "40%",
      textAlign: "left",
    },
    edgeLabelRight: {
      textAlign: "right",
    },
  });
}
