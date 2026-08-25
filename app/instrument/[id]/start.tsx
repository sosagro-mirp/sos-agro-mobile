import { useRef, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChartLine, ArrowRight, ChevronLeft } from "lucide-react-native";
import { useCachedInstrumentsStore } from "../../../src/store/useCachedInstrumentsStore";
import { useInstrumentSurveyStore } from "../../../src/store/useInstrumentSurveyStore";
import { useCampaignSessionStore } from "../../../src/store/useCampaignSessionStore";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { useAuthStore } from "../../../src/store/useAuthStore";
import { beginSurvey } from "../../../src/lib/beginSurvey";
import { OfflineBanner } from "../../../src/components/network/OfflineBanner";
import { AppText } from "../../../src/components/common/AppText";
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
  const { user } = useAuthStore();
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
        <Pressable
          onPress={() => router.back()}
          style={styles.headerSlot}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={8}
        >
          <ChevronLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerTitleWrapper}>
          <AppText style={styles.headerTitle} numberOfLines={1}>
            Instrumento
          </AppText>
          {campaignSessionId && currentStep ? (
            <AppText style={styles.headerSubtitle} numberOfLines={1}>
              Paso {currentStep.order} de {currentStep.totalSteps}
            </AppText>
          ) : null}
        </View>
        <View style={styles.headerSlot} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {campaignSessionId && currentStep ? (
          <View style={styles.stepBadge}>
            <ChartLine size={14} color={colors.brandSubtleFg} strokeWidth={2.4} />
            <Text style={styles.stepText}>
              PASO {currentStep.order} DE {currentStep.totalSteps}
            </Text>
          </View>
        ) : null}

        <Text style={styles.name}>{instrument.name}</Text>
        <Text style={styles.meta}>
          Versión {instrument.version}
          {user?.name ? ` · ${user.name}` : ""}
        </Text>

        <View style={styles.summaryRow}>
          <SummaryItem label="Secciones" value={instrument.sections.length} />
          <SummaryItem label="Preguntas" value={totalQuestions} />
        </View>

        <Text style={styles.contentLabel}>CONTENIDO</Text>
        <View style={styles.sections}>
          {instrument.sections.map((section, index) => (
            <View
              key={section.sectionId}
              style={[
                styles.sectionRow,
                index !== instrument.sections.length - 1 && styles.sectionRowDivider,
              ]}
            >
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{index + 1}</Text>
              </View>
              <Text style={styles.sectionName} numberOfLines={2}>
                {section.name}
              </Text>
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
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{starting ? "Iniciando…" : "Comenzar"}</Text>
          {!starting && (
            <ArrowRight size={18} color={colors.brandForeground} strokeWidth={2.6} />
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
    back: { fontSize: 15, fontFamily: Fonts.regular, color: colors.brand },
    headerTitleWrapper: { flex: 1, minWidth: 0, alignItems: "center" },
    headerTitle: {
      fontSize: 13.5,
      fontFamily: Fonts.bold,
      color: colors.textPrimary,
      textAlign: "center",
    },
    headerSubtitle: {
      fontSize: 10.5,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      marginTop: 2,
      textAlign: "center",
    },
    content: { padding: 14, paddingTop: 20, gap: 0 },
    stepBadge: {
      flexDirection: "row",
      alignSelf: "flex-start",
      alignItems: "center",
      gap: 7,
      backgroundColor: colors.brandSubtleBg,
      borderRadius: 99,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginBottom: 16,
    },
    stepText: { fontSize: 11, fontFamily: Fonts.extraBold, color: colors.brandSubtleFg },
    name: {
      fontSize: 22,
      fontFamily: Fonts.extraBold,
      color: colors.textPrimary,
      lineHeight: 27,
      letterSpacing: -0.3,
      marginBottom: 8,
    },
    meta: { fontSize: 12.5, fontFamily: Fonts.regular, color: colors.textMuted, marginBottom: 22 },
    summaryRow: { flexDirection: "row", gap: 11, marginBottom: 24 },
    summaryItem: {
      flex: 1,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryValue: { fontSize: 30, fontFamily: Fonts.extraBold, color: colors.brand, lineHeight: 32, marginBottom: 6 },
    summaryLabel: {
      fontSize: 11.5,
      fontFamily: Fonts.semiBold,
      color: colors.textMuted,
    },
    contentLabel: {
      fontSize: 10.5,
      fontFamily: Fonts.bold,
      color: colors.textMuted,
      letterSpacing: 0.6,
      marginBottom: 10,
    },
    sections: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      overflow: "hidden",
    },
    sectionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      backgroundColor: colors.surface,
    },
    sectionRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sectionBadge: {
      width: 26,
      height: 26,
      borderRadius: 7,
      backgroundColor: colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    sectionBadgeText: { fontSize: 11, fontFamily: Fonts.extraBold, color: colors.textMuted },
    sectionName: { flex: 1, fontSize: 13, fontFamily: Fonts.semiBold, color: colors.textPrimary, lineHeight: 18 },
    sectionCount: { fontSize: 11, fontFamily: Fonts.regular, color: colors.textMuted, flexShrink: 0 },
    offlineBanner: {
      marginTop: 16,
      backgroundColor: colors.warningBg,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.warningFg,
    },
    offlineText: { fontSize: 12, fontFamily: Fonts.regular, color: colors.warningFg },
    errorBox: {
      marginTop: 16,
      backgroundColor: colors.dangerBg,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    errorBoxText: { fontSize: 12, fontFamily: Fonts.regular, color: colors.dangerFg },
    errorText: {
      fontSize: 16,
      fontFamily: Fonts.regular,
      color: colors.dangerFg,
      margin: 24,
    },
    footer: { padding: 14, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      backgroundColor: colors.brand,
      borderRadius: 11,
      paddingVertical: 17,
    },
    buttonDisabled: { backgroundColor: colors.textMuted },
    buttonText: { fontSize: 15.5, fontFamily: Fonts.extraBold, color: colors.brandForeground },
  });
}
