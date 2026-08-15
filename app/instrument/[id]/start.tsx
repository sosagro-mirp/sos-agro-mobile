import { useRef, useMemo, useState } from "react";
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
import { beginSurvey } from "../../../src/lib/beginSurvey";
import { OfflineBanner } from "../../../src/components/network/OfflineBanner";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";

export default function InstrumentStartScreen() {
  // `existingSurveyId` se retiró en spec 70, Fase 4: el flujo de
  // sobrescritura ya no crea la encuesta de reemplazo por adelantado, así
  // que este screen tiene un único camino de inicio (ver `beginSurvey()`).
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const instrument = useCachedInstrumentsStore((s) =>
    s.instruments.find((i) => i.instrumentId === id)
  );
  const { initializeSurvey } = useInstrumentSurveyStore();
  const { sessionId: campaignSessionId, currentStep, farmerId } = useCampaignSessionStore();
  const { isOnline } = useSyncStatusStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guarda efectiva contra el doble disparo del botón «Comenzar»: `starting`
  // (estado de React) no se refleja de forma síncrona en la clausura ya
  // capturada por un segundo `onPress` dentro del mismo tick, así que dos
  // toques rápidos podían pasar ambos la guarda de estado. `useRef` sí es
  // síncrono — ver spec 70, Fase 1. `starting` se conserva solo para el
  // estado visual del botón (spinner + disabled).
  const startingRef = useRef(false);

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
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    setStarting(true);

    try {
      // Camino único, online y offline, incluida la sobrescritura de un
      // duplicado (spec 70, Fases 2 y 4): el registro en el backend se
      // difiere hasta que exista al menos una respuesta. `beginSurvey()`
      // siempre genera un id local y crea el borrador; el backend recibe la
      // fila real recién al sincronizar.
      const surveyId = await beginSurvey({
        instrumentId: instrument.instrumentId,
        campaignSessionId: campaignSessionId ?? undefined,
        farmerId: farmerId ?? undefined,
        stepOrder: currentStep?.order,
      });

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
      startingRef.current = false;
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
            <ActivityIndicator color={colors.brandForeground} />
          ) : (
            <Text style={styles.buttonText}>Comenzar</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
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
    back: { fontSize: 15, fontFamily: Fonts.regular, color: colors.brand },
    headerTitle: { fontSize: 17, fontFamily: Fonts.bold, color: colors.textPrimary },
    content: { padding: 24, gap: 16 },
    name: { fontSize: 22, fontFamily: Fonts.bold, color: colors.textPrimary },
    meta: { fontSize: 14, fontFamily: Fonts.regular, color: colors.textMuted },
    stepBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.successBg,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    stepText: { fontSize: 13, fontFamily: Fonts.semiBold, color: colors.brand },
    summaryRow: { flexDirection: "row", gap: 16 },
    summaryItem: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryValue: { fontSize: 28, fontFamily: Fonts.bold, color: colors.brand },
    summaryLabel: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      marginTop: 2,
    },
    sections: { gap: 8 },
    sectionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionName: { fontSize: 14, fontFamily: Fonts.semiBold, color: colors.textPrimary },
    sectionCount: { fontSize: 13, fontFamily: Fonts.regular, color: colors.textMuted },
    offlineBanner: {
      backgroundColor: colors.warningBg,
      borderRadius: 8,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.warningFg,
    },
    offlineText: { fontSize: 14, fontFamily: Fonts.regular, color: colors.warningFg },
    errorBox: {
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    errorBoxText: { fontSize: 14, fontFamily: Fonts.regular, color: colors.dangerFg },
    errorText: {
      fontSize: 16,
      fontFamily: Fonts.regular,
      color: colors.dangerFg,
      margin: 24,
    },
    footer: { padding: 20, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
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
