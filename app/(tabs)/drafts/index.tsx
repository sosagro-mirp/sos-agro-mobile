import { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { surveyDraftStore, type SurveyDraft } from "../../../src/storage/surveyDraftStore";
import { instrumentCacheStorage } from "../../../src/storage/instrumentCache";
import { useInstrumentSurveyStore } from "../../../src/store/useInstrumentSurveyStore";
import { flattenSections } from "../../../src/lib/flattenSections";
import { isQuestionVisible } from "../../../src/lib/isQuestionVisible";
import { isAnswerComplete } from "../../../src/lib/isAnswerComplete";
import { Fonts } from "../../../src/theme/fonts";

const GREEN = "#1B6B3A";

export default function DraftsScreen() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<SurveyDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      setError(null);
      surveyDraftStore
        .listDrafts()
        .then(setDrafts)
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Error cargando borradores")
        )
        .finally(() => setIsLoading(false));
    }, [])
  );

  const handleResume = async (draft: SurveyDraft) => {
    if (resumingId) return;
    setResumingId(draft.surveyId);
    setError(null);

    try {
      const instrument = await instrumentCacheStorage.get(draft.instrumentId);
      if (!instrument) {
        setError(
          "El instrumento de este borrador ya no está en caché. Descárgalo de nuevo desde Campañas."
        );
        return;
      }

      const flattenedQuestions = flattenSections(instrument.sections);
      const visibleQuestions = flattenedQuestions.filter(({ question }) =>
        isQuestionVisible(question, draft.answers)
      );
      const firstIncomplete = visibleQuestions.findIndex(
        ({ question }) =>
          !isAnswerComplete(question, draft.answers[question.questionId])
      );

      useInstrumentSurveyStore.getState().initializeSurvey({
        surveyId: draft.surveyId,
        instrumentId: instrument.instrumentId,
        instrumentName: instrument.name,
        sections: instrument.sections,
        campaignSessionId: draft.campaignSessionId,
        restoredAnswers: draft.answers,
      });

      if (firstIncomplete === -1) {
        router.push(`/instrument/${instrument.instrumentId}/review`);
      } else {
        router.push(`/instrument/${instrument.instrumentId}/question/${firstIncomplete}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reanudar borrador");
    } finally {
      setResumingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Borradores</Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.list}>
        {isLoading ? (
          <ActivityIndicator size="large" color={GREEN} style={styles.loader} />
        ) : drafts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Sin borradores</Text>
            <Text style={styles.emptyDesc}>
              Las encuestas en progreso aparecerán aquí.
            </Text>
          </View>
        ) : (
          drafts.map((draft) => (
            <DraftCard
              key={draft.surveyId}
              draft={draft}
              isResuming={resumingId === draft.surveyId}
              onResume={() => handleResume(draft)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DraftCard({
  draft,
  isResuming,
  onResume,
}: {
  draft: SurveyDraft;
  isResuming: boolean;
  onResume: () => void;
}) {
  const answerCount = Object.keys(draft.answers).length;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onResume}
      disabled={isResuming}
      accessibilityRole="button"
    >
      <View style={styles.cardTop}>
        <View style={styles.cardMain}>
          <Text style={styles.instrumentId} numberOfLines={1}>
            {draft.instrumentId}
          </Text>
          {draft.campaignSessionId ? (
            <View style={styles.campaignBadge}>
              <Text style={styles.campaignBadgeText}>En campaña</Text>
            </View>
          ) : null}
        </View>
        {isResuming ? (
          <ActivityIndicator size="small" color={GREEN} />
        ) : (
          <Text style={styles.resumeHint}>Continuar →</Text>
        )}
      </View>

      <Text style={styles.answers}>
        {answerCount} respuesta{answerCount !== 1 ? "s" : ""} guardada
        {answerCount !== 1 ? "s" : ""}
      </Text>
      <Text style={styles.date}>
        Guardado:{" "}
        {draft.updatedAt.toLocaleString("es-CO", {
          dateStyle: "short",
          timeStyle: "short",
        })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: { fontSize: 17, fontFamily: Fonts.bold, color: "#111827" },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { fontSize: 14, fontFamily: Fonts.regular, color: "#DC2626" },
  list: { padding: 20, gap: 12 },
  loader: { marginTop: 48 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 6,
  },
  cardPressed: { opacity: 0.8 },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  cardMain: { flex: 1, gap: 4 },
  instrumentId: { fontSize: 15, fontFamily: Fonts.semiBold, color: "#111827" },
  campaignBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#DCFCE7",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  campaignBadgeText: { fontSize: 11, fontFamily: Fonts.semiBold, color: GREEN },
  resumeHint: { fontSize: 13, fontFamily: Fonts.semiBold, color: GREEN },
  answers: { fontSize: 13, fontFamily: Fonts.regular, color: "#6B7280" },
  date: { fontSize: 12, fontFamily: Fonts.regular, color: "#9CA3AF" },
  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 17, fontFamily: Fonts.semiBold, color: "#374151" },
  emptyDesc: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9CA3AF",
    textAlign: "center",
  },
});
