import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CircleAlert, Check, ArrowRight, ChevronLeft, LoaderCircle } from "lucide-react-native";
import { useInstrumentSurveyStore } from "../../../src/store/useInstrumentSurveyStore";
import { isAnswerComplete } from "../../../src/lib/isAnswerComplete";
import { AppText } from "../../../src/components/common/AppText";
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

  // Decisión pendiente #2 del spec 74 (2026-08-25): "Enviar encuesta" se
  // bloquea mientras falte alguna obligatoria — antes no se bloqueaba nunca.
  // `isAnswerComplete` ya es la misma función que usa `canAdvance()` en el
  // flujo de pregunta, así que el criterio de "completa" no diverge entre
  // pantallas.
  const missingCount = visible.filter(
    ({ question }) => !isAnswerComplete(question, answers[question.questionId]),
  ).length;
  const canSubmit = missingCount === 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
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
        <Pressable
          onPress={() => router.back()}
          style={styles.headerSlot}
          accessibilityRole="button"
          accessibilityLabel="Volver a la última pregunta"
          hitSlop={8}
        >
          <ChevronLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerTitleWrapper}>
          <AppText style={styles.headerTitle} numberOfLines={1}>
            Revisión
          </AppText>
          <AppText style={styles.headerSubtitle} numberOfLines={1}>
            Última pregunta
          </AppText>
        </View>
        <View style={styles.headerSlot} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.instrumentName}>{instrumentName}</Text>

        <View style={[styles.summaryBanner, missingCount === 0 && styles.summaryBannerOk]}>
          {missingCount === 0 ? (
            <Check size={19} color={colors.successFg} strokeWidth={2.4} />
          ) : (
            <CircleAlert size={19} color={colors.dangerFg} strokeWidth={2.4} />
          )}
          <View style={styles.summaryTextWrapper}>
            <Text style={[styles.summaryTitle, missingCount === 0 && styles.summaryTitleOk]}>
              {answeredCount} de {visible.length} respondidas
            </Text>
            <Text style={[styles.summarySub, missingCount === 0 && styles.summarySubOk]}>
              {missingCount === 0
                ? "Todas las obligatorias están completas"
                : `Falta${missingCount !== 1 ? "n" : ""} ${missingCount} obligatoria${missingCount !== 1 ? "s" : ""} para poder enviar`}
            </Text>
          </View>
        </View>

        <View style={styles.cards}>
          {visible.map(({ question, sectionName }, index) => {
            const answer = answers[question.questionId];
            const missing = !isAnswerComplete(question, answer);
            const hasAnswer = answer !== undefined;

            return (
              <Pressable
                key={question.questionId}
                style={[styles.card, missing && styles.cardMissing]}
                onPress={() => handleEdit(index)}
                accessibilityRole="button"
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.sectionLabel} numberOfLines={1}>
                    {sectionName?.toUpperCase()}
                  </Text>
                  {missing && (
                    <View style={styles.requiredBadge}>
                      <Text style={styles.requiredBadgeText}>REQUERIDA</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.questionText} numberOfLines={3}>
                  {question.text}
                </Text>
                <View style={styles.answerRow}>
                  {hasAnswer ? (
                    <Check size={15} color={colors.successFg} strokeWidth={2.6} />
                  ) : (
                    <CircleAlert size={15} color={colors.dangerFg} strokeWidth={2.4} />
                  )}
                  <Text
                    style={[styles.answerText, !hasAnswer && styles.answerTextEmpty]}
                    numberOfLines={1}
                  >
                    {formatAnswer(answer)}
                  </Text>
                  <Text style={styles.editHint}>Editar</Text>
                  <ArrowRight size={14} color={colors.brand} strokeWidth={2.6} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <LoaderCircle size={18} color={colors.brandForeground} />
          ) : (
            <Text style={[styles.buttonText, missingCount > 0 && styles.buttonTextDisabled]}>
              Enviar encuesta
            </Text>
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
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerSlot: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    headerTitleWrapper: { flex: 1, minWidth: 0, alignItems: "center" },
    headerTitle: { fontSize: 13.5, fontFamily: Fonts.bold, color: colors.textPrimary, textAlign: "center" },
    headerSubtitle: {
      fontSize: 10.5,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      marginTop: 2,
      textAlign: "center",
    },
    content: { padding: 14, paddingTop: 16 },
    instrumentName: {
      fontSize: 19,
      fontFamily: Fonts.extraBold,
      color: colors.textPrimary,
      letterSpacing: -0.3,
      marginBottom: 16,
    },
    summaryBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      borderWidth: 1,
      borderColor: colors.dangerFg,
      backgroundColor: colors.dangerBg,
      borderRadius: 11,
      padding: 14,
      marginBottom: 16,
    },
    summaryBannerOk: { borderColor: colors.successFg, backgroundColor: colors.successBg },
    summaryTextWrapper: { flex: 1, minWidth: 0 },
    summaryTitle: { fontSize: 13.5, fontFamily: Fonts.extraBold, color: colors.dangerFg, marginBottom: 2 },
    summaryTitleOk: { color: colors.successFg },
    summarySub: { fontSize: 11.5, color: colors.dangerFg, opacity: 0.9, lineHeight: 16 },
    summarySubOk: { color: colors.successFg },
    cards: { gap: 11 },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
    },
    cardMissing: { borderColor: colors.dangerFg, backgroundColor: colors.dangerBg },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    sectionLabel: { flex: 1, fontSize: 9.5, fontFamily: Fonts.extraBold, color: colors.textMuted, letterSpacing: 0.6 },
    requiredBadge: {
      backgroundColor: colors.dangerFg,
      borderRadius: 99,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    requiredBadgeText: { fontSize: 9.5, fontFamily: Fonts.extraBold, color: colors.brandForeground },
    questionText: { fontSize: 13.5, fontFamily: Fonts.medium, color: colors.textPrimary, lineHeight: 19, marginBottom: 9 },
    answerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingTop: 9,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    answerText: { flex: 1, fontSize: 13.5, fontFamily: Fonts.bold, color: colors.successFg },
    answerTextEmpty: { color: colors.dangerFg },
    editHint: { fontSize: 11, fontFamily: Fonts.bold, color: colors.brand },
    errorBox: {
      marginHorizontal: 14,
      marginBottom: 8,
      padding: 12,
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    errorText: { fontSize: 14, fontFamily: Fonts.regular, color: colors.dangerFg },
    footer: {
      padding: 14,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      backgroundColor: colors.brand,
      borderRadius: 11,
      paddingVertical: 17,
    },
    buttonDisabled: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderStrong },
    buttonText: { fontSize: 15.5, fontFamily: Fonts.extraBold, color: colors.brandForeground },
    buttonTextDisabled: { color: colors.textMuted },
  });
}
