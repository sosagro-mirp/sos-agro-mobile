import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInstrumentSurveyStore } from "../../../src/store/useInstrumentSurveyStore";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const {
    instrumentName,
    visibleQuestions,
    answers,
    enqueueSubmission,
    isSubmitting,
  } = useInstrumentSurveyStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const visible = visibleQuestions();
  const [error, setError] = useState<string | null>(null);

  const answeredCount = visible.filter(
    ({ question }) => answers[question.questionId] !== undefined
  ).length;

  const handleSubmit = async () => {
    setError(null);
    const result = await enqueueSubmission();
    if (result.outcome === "error") {
      setError(result.message);
      return;
    }
    router.replace(`/instrument/${id}/completed`);
  };

  const handleEdit = (index: number) => {
    router.push(`/instrument/${id}/question/${index}`);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Última pregunta</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Revisión</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.instrumentName}>{instrumentName}</Text>
        <Text style={styles.summary}>
          {answeredCount} de {visible.length} preguntas respondidas
        </Text>

        {visible.map(({ question, sectionName }, index) => {
          const answer = answers[question.questionId];
          const hasAnswer = answer !== undefined;

          return (
            <Pressable
              key={question.questionId}
              style={({ pressed }) => [
                styles.questionRow,
                !hasAnswer && styles.questionRowUnanswered,
                pressed && styles.questionRowPressed,
              ]}
              onPress={() => handleEdit(index)}
            >
              <View style={styles.questionMeta}>
                <Text style={styles.sectionLabel}>{sectionName}</Text>
                {question.isRequired && !hasAnswer && (
                  <Text style={styles.requiredBadge}>Requerida</Text>
                )}
              </View>
              <Text style={styles.questionText} numberOfLines={2}>
                {question.text}
              </Text>
              <Text
                style={[styles.answerText, !hasAnswer && styles.answerTextEmpty]}
                numberOfLines={1}
              >
                {formatAnswer(answer)}
              </Text>
              <Text style={styles.editHint}>Toca para editar →</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.brandForeground} />
          ) : (
            <Text style={styles.buttonText}>Enviar encuesta</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function formatAnswer(answer: ReturnType<typeof useInstrumentSurveyStore.getState>["answers"][string]): string {
  if (!answer) return "Sin respuesta";
  if (answer.textValue !== undefined) return answer.textValue || "—";
  if (answer.numericValue !== undefined) return String(answer.numericValue);
  if (answer.booleanValue !== undefined) return answer.booleanValue ? "Sí" : "No";
  if (answer.optionIds?.length) {
    return `${answer.optionIds.length} opción${answer.optionIds.length !== 1 ? "es" : ""} seleccionada${answer.optionIds.length !== 1 ? "s" : ""}`;
  }
  if (answer.optionId) return "Seleccionado";
  return "Sin respuesta";
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    back: { fontSize: 14, fontFamily: Fonts.regular, color: colors.brand },
    headerTitle: { fontSize: 17, fontFamily: Fonts.bold, color: colors.textPrimary },
    content: { padding: 20, gap: 12 },
    instrumentName: { fontSize: 20, fontFamily: Fonts.bold, color: colors.textPrimary },
    summary: { fontSize: 14, fontFamily: Fonts.regular, color: colors.textMuted, marginBottom: 4 },
    questionRow: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    questionRowUnanswered: {
      borderColor: colors.dangerFg,
      backgroundColor: colors.dangerBg,
    },
    questionRowPressed: { opacity: 0.8 },
    questionMeta: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sectionLabel: { fontSize: 11, fontFamily: Fonts.regular, color: colors.textMuted },
    requiredBadge: {
      fontSize: 11,
      fontFamily: Fonts.semiBold,
      color: colors.dangerFg,
      backgroundColor: colors.dangerBg,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    questionText: { fontSize: 14, fontFamily: Fonts.semiBold, color: colors.textPrimary },
    answerText: { fontSize: 14, fontFamily: Fonts.regular, color: colors.brand },
    answerTextEmpty: { color: colors.textMuted, fontStyle: "italic" },
    editHint: { fontSize: 11, fontFamily: Fonts.regular, color: colors.textMuted, textAlign: "right" },
    errorBox: {
      marginHorizontal: 20,
      marginBottom: 8,
      padding: 12,
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    errorText: { fontSize: 14, fontFamily: Fonts.regular, color: colors.dangerFg },
    footer: {
      padding: 20,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    button: {
      backgroundColor: colors.brand,
      borderRadius: 12,
      paddingVertical: 18,
      alignItems: "center",
    },
    buttonDisabled: { backgroundColor: colors.textMuted },
    buttonText: { fontSize: 17, fontFamily: Fonts.bold, color: colors.brandForeground },
  });
}
