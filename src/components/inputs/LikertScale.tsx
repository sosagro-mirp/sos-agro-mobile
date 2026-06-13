import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Fonts } from "../../theme/fonts";
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

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: 12,
  },
  track: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#9CA3AF",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  circleSelected: {
    borderColor: "#1B6B3A",
    backgroundColor: "#1B6B3A",
  },
  circleDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  edgeLabel: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 18,
    color: "#6B7280",
    maxWidth: "40%",
    textAlign: "left",
  },
  edgeLabelRight: {
    textAlign: "right",
  },
});
