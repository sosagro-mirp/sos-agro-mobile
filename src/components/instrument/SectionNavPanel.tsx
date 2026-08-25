import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Check } from "lucide-react-native";
import { isAnswerComplete } from "../../lib/isAnswerComplete";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import type { FlattenedQuestionItem, InstrumentDraftAnswer } from "../../types";

interface SectionNavPanelProps {
  sectionName: string;
  questions: FlattenedQuestionItem[];
  currentQuestionId: string;
  answers: Record<string, InstrumentDraftAnswer>;
  onSelect: (questionId: string) => void;
}

/**
 * Panel izquierdo del instrumento en tablet — spec 74, Fase 10. Adapta el
 * "índice de secciones" del mockup (pensado para la Variante B, descartada
 * en la Fase 9) a la Variante A ya migrada: en vez de secciones completas,
 * lista las preguntas de la sección **actual** con su estado y permite
 * saltar directo por toque, sin salir del flujo pregunta por pregunta.
 */
export function SectionNavPanel({
  sectionName,
  questions,
  currentQuestionId,
  answers,
  onSelect,
}: SectionNavPanelProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.panel}>
      <Text style={styles.title} numberOfLines={2}>{sectionName?.toUpperCase()}</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {questions.map((item) => {
          const isCurrent = item.question.questionId === currentQuestionId;
          const complete = isAnswerComplete(item.question, answers[item.question.questionId]);
          return (
            <TouchableOpacity
              key={item.question.questionId}
              style={[styles.row, isCurrent && styles.rowActive]}
              onPress={() => onSelect(item.question.questionId)}
              accessibilityRole="button"
            >
              <View style={[styles.status, complete && styles.statusComplete]}>
                {complete ? <Check size={11} color={colors.brandForeground} strokeWidth={3} /> : null}
              </View>
              <Text
                style={[styles.rowText, isCurrent && styles.rowTextActive]}
                numberOfLines={2}
              >
                {item.question.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    panel: {
      width: 280,
      flexShrink: 0,
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      paddingHorizontal: 14,
      paddingTop: 16,
    },
    title: {
      fontSize: 10.5,
      fontFamily: Fonts.extraBold,
      color: colors.textMuted,
      letterSpacing: 0.6,
      marginBottom: 12,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      paddingVertical: 9,
      paddingHorizontal: 8,
      borderRadius: 8,
    },
    rowActive: {
      backgroundColor: colors.brandSubtleBg,
    },
    status: {
      width: 18,
      height: 18,
      borderRadius: 99,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
      flexShrink: 0,
    },
    statusComplete: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    rowText: {
      flex: 1,
      fontSize: 12.5,
      fontFamily: Fonts.medium,
      color: colors.textMuted,
      lineHeight: 17,
    },
    rowTextActive: {
      color: colors.textPrimary,
      fontFamily: Fonts.bold,
    },
  });
}
