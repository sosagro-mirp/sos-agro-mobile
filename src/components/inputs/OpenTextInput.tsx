import React, { useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import type { InstrumentDraftAnswer } from "../../types/instrument";

interface Props {
  questionId: string;
  value: string | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

export function OpenTextInput({ questionId, value, onChange }: Props): React.JSX.Element {
  const [focused, setFocused] = useState(false);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
        placeholderTextColor={colors.textMuted}
        placeholder="Escribe tu respuesta aquí..."
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      width: "100%",
    },
    input: {
      fontFamily: Fonts.regular,
      fontSize: 15,
      lineHeight: 22,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 13,
      minHeight: 120,
    },
    inputFocused: {
      borderColor: colors.brand,
    },
  });
}
