import React, { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import type { InstrumentDraftAnswer } from "../../types/instrument";

interface Props {
  questionId: string;
  value: number | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

export function NumericInput({ questionId, value, onChange }: Props): React.JSX.Element {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState<string>(value !== undefined ? String(value) : "");

  function handleChange(text: string): void {
    setRaw(text);
    if (text === "" || text === "-") {
      onChange({ questionId });
      return;
    }
    const parsed = parseFloat(text);
    if (!isNaN(parsed)) {
      onChange({ questionId, numericValue: parsed });
    } else {
      onChange({ questionId });
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, focused && styles.inputFocused]}
        value={raw}
        onChangeText={handleChange}
        keyboardType="decimal-pad"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor="#9CA3AF"
        placeholder="0"
        returnKeyType="done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  input: {
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
  inputFocused: {
    borderColor: "#1B6B3A",
  },
});
