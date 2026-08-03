import React, { useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import type { InstrumentDraftAnswer } from "../../types/instrument";

interface Props {
  questionId: string;
  value: number | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

export function NumericInput({ questionId, value, onChange }: Props): React.JSX.Element {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState<string>(value !== undefined ? String(value) : "");
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
        placeholderTextColor={colors.textMuted}
        placeholder="0"
        returnKeyType="done"
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
      fontSize: 18,
      lineHeight: 26,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 0,
      height: 56,
      minHeight: 56,
    },
    inputFocused: {
      borderColor: colors.brand,
    },
  });
}
