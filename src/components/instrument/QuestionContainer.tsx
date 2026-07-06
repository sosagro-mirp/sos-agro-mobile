import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { InstrumentQuestion } from "../../types";
import { RequiredFieldIndicator } from "./RequiredFieldIndicator";
import { Fonts } from "../../theme/fonts";

interface QuestionContainerProps {
  question: InstrumentQuestion;
  children: React.ReactNode;
  /** Cuando el input hijo maneja su propio scroll (ej. FlatList de opciones
   * con buscador), propaga flex:1 para que ocupe el espacio vertical
   * disponible en vez de dimensionarse por contenido. */
  fillHeight?: boolean;
}

export const QuestionContainer: React.FC<QuestionContainerProps> = ({
  question,
  children,
  fillHeight = false,
}) => {
  return (
    <View style={[styles.container, fillHeight && styles.fill]}>
      <Text style={styles.questionText}>{question.text}</Text>
      <RequiredFieldIndicator required={question.isRequired} />
      <View style={[styles.inputWrapper, fillHeight && styles.fill]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
  },
  fill: {
    flex: 1,
  },
  questionText: {
    fontFamily: Fonts.semiBold,
    fontSize: 18,
    color: "#111827",
    marginBottom: 6,
    lineHeight: 26,
  },
  inputWrapper: {
    marginTop: 12,
  },
});
