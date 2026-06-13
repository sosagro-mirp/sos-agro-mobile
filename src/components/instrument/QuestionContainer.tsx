import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { InstrumentQuestion } from "../../types";
import { RequiredFieldIndicator } from "./RequiredFieldIndicator";
import { Fonts } from "../../theme/fonts";

interface QuestionContainerProps {
  question: InstrumentQuestion;
  children: React.ReactNode;
}

export const QuestionContainer: React.FC<QuestionContainerProps> = ({
  question,
  children,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.questionText}>{question.text}</Text>
      <RequiredFieldIndicator required={question.isRequired} />
      <View style={styles.inputWrapper}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
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
