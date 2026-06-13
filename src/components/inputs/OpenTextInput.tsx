import React, { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import type { InstrumentDraftAnswer } from "../../types/instrument";

interface Props {
  questionId: string;
  value: string | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

export function OpenTextInput({ questionId, value, onChange }: Props): React.JSX.Element {
  const [focused, setFocused] = useState(false);

  function handleChange(text: string): void {
    onChange({ questionId, textValue: text });
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, focused && styles.inputFocused]}
        value={value ?? ""}
        onChangeText={handleChange}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor="#9CA3AF"
        placeholder="Escribe tu respuesta aquí..."
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
    paddingVertical: 14,
    minHeight: 120,
  },
  inputFocused: {
    borderColor: "#1B6B3A",
  },
});
