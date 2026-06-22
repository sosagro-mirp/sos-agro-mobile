import { useState } from "react";
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
import { useCachedInstrumentsStore } from "../../../src/store/useCachedInstrumentsStore";
import { useInstrumentSurveyStore } from "../../../src/store/useInstrumentSurveyStore";
import { useCampaignSessionStore } from "../../../src/store/useCampaignSessionStore";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { createSurvey } from "../../../src/api/surveys";
import { surveyDraftStore } from "../../../src/storage/surveyDraftStore";
import { generateLocalId } from "../../../src/lib/generateLocalId";
import { OfflineBanner } from "../../../src/components/network/OfflineBanner";
import { Fonts } from "../../../src/theme/fonts";

export default function InstrumentStartScreen() {
  const { id, existingSurveyId } = useLocalSearchParams<{ id: string; existingSurveyId?: string }>();
  const router = useRouter();

  const instrument = useCachedInstrumentsStore((s) =>
    s.instruments.find((i) => i.instrumentId === id)
  );
  const { initializeSurvey } = useInstrumentSurveyStore();
  const { sessionId: campaignSessionId, currentStep, farmerId } = useCampaignSessionStore();
  const { isOnline } = useSyncStatusStore();

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!instrument) {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={styles.errorText}>Instrumento no encontrado en caché.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const totalQuestions = instrument.sections.reduce(
    (acc, s) => acc + s.questions.length,
    0
  );

  const handleStart = async () => {
    if (starting) return;
    setError(null);
    setStarting(true);

    try {
      let surveyId: string;

      if (existingSurveyId) {
        // Overwrite flow: backend already created the survey via /overwrite.
        surveyId = existingSurveyId;
        await surveyDraftStore.createDraft({
          surveyId,
          instrumentId: instrument.instrumentId,
          campaignSessionId: campaignSessionId ?? undefined,
          farmerId: farmerId ?? undefined,
        });
      } else if (isOnline) {
        const response = await createSurvey({
          instrumentIds: [instrument.instrumentId],
          ...(campaignSessionId ? { campaignSessionId } : {}),
          ...(currentStep ? { stepOrder: currentStep.order } : {}),
          ...(farmerId ? { farmerId } : {}),
        });
        surveyId = response.surveyId;

        await surveyDraftStore.createDraft({
          surveyId,
          instrumentId: instrument.instrumentId,
          campaignSessionId: campaignSessionId ?? undefined,
          farmerId: farmerId ?? undefined,
        });
      } else {
        // Offline: generate a local id; SyncQueueService materializes it on reconnect.
        surveyId = generateLocalId('survey');
        await surveyDraftStore.createDraft({
          surveyId,
          instrumentId: instrument.instrumentId,
          campaignSessionId: campaignSessionId ?? undefined,
          farmerId: farmerId ?? undefined,
        });
      }

      initializeSurvey({
        surveyId,
        instrumentId: instrument.instrumentId,
        instrumentName: instrument.name,
        sections: instrument.sections,
        campaignSessionId: campaignSessionId ?? undefined,
        stepOrder: currentStep?.order,
      });

      router.push(`/instrument/${id}/question/0`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al iniciar la encuesta"
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <OfflineBanner />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Instrumento</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.name}>{instrument.name}</Text>
        <Text style={styles.meta}>Versión {instrument.version}</Text>

        {campaignSessionId && currentStep ? (
          <View style={styles.stepBadge}>
            <Text style={styles.stepText}>
              Paso {currentStep.order} de {currentStep.totalSteps}
            </Text>
          </View>
        ) : null}

        <View style={styles.summaryRow}>
          <SummaryItem label="Secciones" value={instrument.sections.length} />
          <SummaryItem label="Preguntas" value={totalQuestions} />
        </View>

        <View style={styles.sections}>
          {instrument.sections.map((section) => (
            <View key={section.sectionId} style={styles.sectionRow}>
              <Text style={styles.sectionName}>{section.name}</Text>
              <Text style={styles.sectionCount}>
                {section.questions.length} preg.
              </Text>
            </View>
          ))}
        </View>

        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>
              Sin conexión — la encuesta se sincronizará al reconectar.
            </Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.button, starting && styles.buttonDisabled]}
          onPress={handleStart}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Comenzar</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const GREEN = "#1B6B3A";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  back: { fontSize: 15, fontFamily: Fonts.regular, color: GREEN },
  headerTitle: { fontSize: 17, fontFamily: Fonts.bold, color: "#111827" },
  content: { padding: 24, gap: 16 },
  name: { fontSize: 22, fontFamily: Fonts.bold, color: "#111827" },
  meta: { fontSize: 14, fontFamily: Fonts.regular, color: "#9CA3AF" },
  stepBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#DCFCE7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stepText: { fontSize: 13, fontFamily: Fonts.semiBold, color: GREEN },
  summaryRow: { flexDirection: "row", gap: 16 },
  summaryItem: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  summaryValue: { fontSize: 28, fontFamily: Fonts.bold, color: GREEN },
  summaryLabel: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#6B7280",
    marginTop: 2,
  },
  sections: { gap: 8 },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionName: { fontSize: 14, fontFamily: Fonts.semiBold, color: "#374151" },
  sectionCount: { fontSize: 13, fontFamily: Fonts.regular, color: "#9CA3AF" },
  offlineBanner: {
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  offlineText: { fontSize: 14, fontFamily: Fonts.regular, color: "#92400E" },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorBoxText: { fontSize: 14, fontFamily: Fonts.regular, color: "#DC2626" },
  errorText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#DC2626",
    margin: 24,
  },
  footer: { padding: 20, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  button: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
  },
  buttonDisabled: { backgroundColor: "#9CA3AF" },
  buttonText: { fontSize: 17, fontFamily: Fonts.bold, color: "#fff" },
});
