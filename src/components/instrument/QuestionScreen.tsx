import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  type DimensionValue,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Check, ChevronLeft, ArrowRight, List, X } from "lucide-react-native";
import { useInstrumentSurveyStore } from "../../store/useInstrumentSurveyStore";
import { useCampaignSessionStore } from "../../store/useCampaignSessionStore";
import { OfflineBanner } from "../network/OfflineBanner";
import { ConsentModal } from "../campaign/ConsentModal";
import { QuestionContainer } from "./QuestionContainer";
import { QuestionRenderer } from "./QuestionRenderer";
import { SectionNavPanel } from "./SectionNavPanel";
import { RespondentContextPanel } from "./RespondentContextPanel";
import { AppText } from "../common/AppText";
import { ConfirmSheet } from "../common/ConfirmSheet";
import { SecondaryButton } from "../common/SecondaryButton";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import { OPTION_SEARCH_THRESHOLD } from "../../lib/optionSearch";
import { useBreakpoint } from "../../lib/useBreakpoint";
import { INSTRUMENT_PANELS_MIN_WIDTH } from "../../lib/resolveBreakpoint";
import { resolveConditionReason } from "../../lib/resolveConditionReason";
import type { InstrumentDraftAnswer } from "../../types";

const SEARCHABLE_TYPES = new Set(["single_choice", "multiple_choice"]);

interface QuestionScreenProps {
  instrumentId: string;
  onFinished: () => void;
}

export const QuestionScreen: React.FC<QuestionScreenProps> = ({
  instrumentId,
  onFinished,
}) => {
  const router = useRouter();
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Umbral propio, más exigente que el general de 720dp: por debajo de
  // INSTRUMENT_PANELS_MIN_WIDTH los tres paneles fijos comprimen la columna
  // de lectura a un ancho inutilizable (hallazgo TC-074-87, tablet en
  // portrait) — se degrada a una sola columna en vez de mostrarlos apretados.
  const isTablet = useBreakpoint(INSTRUMENT_PANELS_MIN_WIDTH) === "tablet";

  const answers = useInstrumentSurveyStore((s) => s.answers);
  const currentIndex = useInstrumentSurveyStore((s) => s.currentIndex);
  const setAnswer = useInstrumentSurveyStore((s) => s.setAnswer);
  const goToNext = useInstrumentSurveyStore((s) => s.goToNext);
  const goToPrev = useInstrumentSurveyStore((s) => s.goToPrev);
  const goToIndex = useInstrumentSurveyStore((s) => s.goToIndex);
  const canAdvance = useInstrumentSurveyStore((s) => s.canAdvance);
  const visibleQuestions = useInstrumentSurveyStore((s) => s.visibleQuestions);
  const savedQuestionId = useInstrumentSurveyStore((s) => s.savedQuestionId);
  const surveyInstrumentName = useInstrumentSurveyStore((s) => s.instrumentName);
  const farmerName = useCampaignSessionStore((s) => s.farmerName);
  // Cambio de alcance (2026-08-28, spec 78, Fase 15) — aviso persistente de
  // consentimiento pendiente, visible mientras se responde (no solo antes de
  // empezar). Mismo store que ya alimenta el resto de la sesión de campaña.
  const sessionId = useCampaignSessionStore((s) => s.sessionId);
  const farmerId = useCampaignSessionStore((s) => s.farmerId);
  const consentPending = useCampaignSessionStore((s) => s.consentPending);
  const setConsentPending = useCampaignSessionStore((s) => s.setConsentPending);
  const [consentModalVisible, setConsentModalVisible] = useState(false);

  const visible = visibleQuestions();
  const total = visible.length;
  const currentItem = visible[currentIndex];

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === total - 1;

  const handleChange = (answer: InstrumentDraftAnswer) => {
    if (!currentItem) return;
    setAnswer(currentItem.question.questionId, answer);
  };

  const altitudeQuestion = visible.find(
    (q) => q.question.systemField === "farm.altitude",
  );

  const handleAltitudeObtained = (altitude: number) => {
    if (!altitudeQuestion) return;
    const existing = answers[altitudeQuestion.question.questionId];
    if (existing?.numericValue !== undefined) return;
    setAnswer(altitudeQuestion.question.questionId, {
      questionId: altitudeQuestion.question.questionId,
      numericValue: altitude,
    });
  };

  // `replace`, no `push`: con `push`, cada pregunta apilaba una pantalla que
  // quedaba montada por debajo (este repo no usa freezeOnBlur/enableFreeze).
  // Un flujo de campaña completo son ~83 preguntas, y react-native-screens
  // crea un Fragment de Android por pantalla: el estado que Android debe
  // serializar al pasar la app a segundo plano llegaba a ~911 KB, contra el
  // límite de ~1 MB del Binder, y la app moría con
  // TransactionTooLargeException (Sentry REACT-NATIVE-3, 2026-08-18).
  // Con `replace` solo vive una pantalla de pregunta a la vez.
  const handleNext = () => {
    if (isLast) {
      onFinished();
      return;
    }
    goToNext();
    router.replace(`/instrument/${instrumentId}/question/${currentIndex + 1}`);
  };

  // Navegación explícita en vez de `router.back()`: ya no hay una pregunta
  // anterior en el stack a la que volver.
  const handlePrev = () => {
    if (isFirst) return;
    goToPrev();
    router.replace(`/instrument/${instrumentId}/question/${currentIndex - 1}`);
  };

  if (!currentItem) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No hay preguntas disponibles.</Text>
          <SecondaryButton
            label="Volver a campañas"
            onPress={() => router.replace("/(tabs)/campaign")}
          />
        </View>
      </SafeAreaView>
    );
  }

  const currentAnswer = answers[currentItem.question.questionId];
  const isSaved = savedQuestionId === currentItem.question.questionId;
  const progress = total > 0 ? Math.min((currentIndex + 1) / total, 1) : 0;
  const progressPercent = `${Math.round(progress * 100)}%`;

  // Panel izquierdo (tablet, spec 74 Fase 10): preguntas de la sección
  // actual, no de todo el instrumento — es la adaptación a Variante A.
  const sectionQuestions = visible.filter((item) => item.sectionId === currentItem.sectionId);
  const handleJumpTo = (questionId: string) => {
    const targetIndex = visible.findIndex((item) => item.question.questionId === questionId);
    if (targetIndex === -1 || targetIndex === currentIndex) return;
    goToIndex(targetIndex);
    router.replace(`/instrument/${instrumentId}/question/${targetIndex}`);
  };
  const conditionReason = resolveConditionReason(
    currentItem.question,
    visible.map((item) => item.question),
    answers,
  );

  // Cuando la pregunta tiene buscador (más opciones que el umbral), el
  // FlatList interno de la lista de opciones debe ser el único contenedor de
  // scroll — anidarlo dentro del ScrollView externo rompe la virtualización
  // (RN lo advierte explícitamente) y reintroduce el lag que se busca evitar.
  const needsOwnScroll =
    SEARCHABLE_TYPES.has(currentItem.question.type?.name) &&
    currentItem.question.options.length > OPTION_SEARCH_THRESHOLD;

  const questionContent = (
    <QuestionContainer question={currentItem.question} fillHeight={needsOwnScroll}>
      <QuestionRenderer
        item={currentItem}
        answer={currentAnswer}
        onChange={handleChange}
        onAltitudeObtained={handleAltitudeObtained}
      />
    </QuestionContainer>
  );

  // Panel izquierdo / centro / derecho solo en tablet (spec 74, Fase 10). En
  // teléfono el layout queda exactamente igual que antes de esta fase.
  const questionColumn = (
    <KeyboardAvoidingView
      style={[styles.kavContainer, isTablet && styles.kavContainerTablet]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "android" ? -24 : 0}
    >
      {/* 1. Header: X de salida + marca + acción de índice (reservada,
          deshabilitada hasta que exista una pantalla de índice real —
          Fase 9, Variante B) */}
      <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setShowExitConfirm(true)}
            style={styles.headerSlot}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Salir de la encuesta"
            accessibilityRole="button"
          >
            <X size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrapper}>
            <AppText style={styles.headerTitle} numberOfLines={1}>
              Sos Agro 4.C
            </AppText>
          </View>
          <View style={[styles.headerSlot, styles.headerSlotDisabled]}>
            <List size={19} color={colors.textMuted} />
          </View>
        </View>

        {/* 2. Chrome fusionado: sección + contador + ficha «Guardado» + progreso */}
        <View style={styles.chrome}>
          <View style={styles.chromeAccent} />
          <View style={styles.chromeBody}>
            <View style={styles.chromeRow}>
              <AppText style={styles.sectionName} numberOfLines={1}>
                {currentItem.sectionName?.toUpperCase()}
              </AppText>
              <Text style={styles.counter}>
                {currentIndex + 1} / {total}
              </Text>
              {isSaved ? (
                <View style={styles.savedChip}>
                  <Check size={13} color={colors.successFg} strokeWidth={2.8} />
                  <Text style={styles.savedChipText}>Guardado</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: progressPercent as DimensionValue }]} />
            </View>
          </View>
        </View>

        {/* 3. Pregunta + input */}
        {needsOwnScroll ? (
          <View style={[styles.scrollView, styles.ownScrollContainer]}>
            {questionContent}
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {questionContent}
          </ScrollView>
        )}

        {/* 4. Footer: navegación */}
        <View style={styles.footer}>
          {!isFirst && (
            <TouchableOpacity
              onPress={handlePrev}
              style={styles.prevButton}
              accessibilityRole="button"
              accessibilityLabel="Pregunta anterior"
            >
              <ChevronLeft size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleNext}
            disabled={!canAdvance()}
            style={[styles.nextButton, !canAdvance() && styles.nextButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel={isLast ? "Finalizar encuesta" : "Siguiente pregunta"}
          >
            <Text
              style={[styles.nextButtonText, !canAdvance() && styles.nextButtonTextDisabled]}
            >
              {isLast ? "Finalizar" : "Siguiente"}
            </Text>
            <ArrowRight
              size={19}
              color={canAdvance() ? colors.brandForeground : colors.textMuted}
              strokeWidth={2.6}
            />
          </TouchableOpacity>
        </View>
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <OfflineBanner />
      {/* Spec 78, cambio de alcance (2026-08-28) — criterio 1-cuarter/1-sexter:
          aviso persistente mientras el encuestado no tenga consentimiento
          vigente, con acceso directo al formulario, funcionando offline. */}
      {consentPending && sessionId && (
        <View style={[styles.consentBanner, !isTablet && styles.consentBannerCompact]}>
          <Text style={styles.consentBannerText}>
            Este encuestado todavía no dio su consentimiento informado.
          </Text>
          <TouchableOpacity
            onPress={() => setConsentModalVisible(true)}
            style={[styles.consentBannerButton, !isTablet && styles.consentBannerButtonCompact]}
            accessibilityRole="button"
          >
            <Text style={styles.consentBannerButtonText}>Registrar consentimiento</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.body, isTablet && styles.bodyTablet]}>
        {isTablet ? (
          <SectionNavPanel
            sectionName={currentItem.sectionName}
            questions={sectionQuestions}
            currentQuestionId={currentItem.question.questionId}
            answers={answers}
            onSelect={handleJumpTo}
          />
        ) : null}

        {questionColumn}

        {isTablet ? (
          <RespondentContextPanel
            farmerName={farmerName}
            instrumentName={surveyInstrumentName}
            conditionReason={conditionReason}
          />
        ) : null}
      </View>

      {/* Confirmación de salida — bottom sheet compartido (spec 74, Fase 1),
          reemplaza el modal propio que tenía esta pantalla. No es una acción
          destructiva (las respuestas quedan guardadas como borrador), así
          que "Seguir respondiendo" es el camino seguro (primario) y "Salir"
          el neutro, no el destructivo separado. */}
      <ConfirmSheet
        visible={showExitConfirm}
        icon={X}
        tone="warning"
        title="¿Salir de la encuesta?"
        body="La encuesta está sin terminar. Las respuestas guardadas quedarán como borrador y podrás reanudarla más tarde."
        primaryAction={{
          label: "Seguir respondiendo",
          onPress: () => setShowExitConfirm(false),
        }}
        secondaryAction={{
          label: "Salir",
          icon: X,
          onPress: () => {
            setShowExitConfirm(false);
            router.replace("/(tabs)/campaign");
          },
        }}
        onRequestClose={() => setShowExitConfirm(false)}
      />

      {sessionId && (
        <ConsentModal
          visible={consentModalVisible}
          sessionId={sessionId}
          farmerId={farmerId ?? undefined}
          farmerName={farmerName ?? undefined}
          onAccepted={() => {
            setConsentPending(false);
            setConsentModalVisible(false);
          }}
          onClose={() => setConsentModalVisible(false)}
        />
      )}
    </SafeAreaView>
  );
};

export default QuestionScreen;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.surfaceMuted,
    },
    // Fila de tres columnas en tablet (spec 74, Fase 10): panel de
    // navegación + columna de lectura + panel de contexto. En teléfono es
    // un `flex: 1` normal — `questionColumn` es el único hijo.
    body: {
      flex: 1,
    },
    bodyTablet: {
      flexDirection: "row",
    },
    kavContainer: {
      flex: 1,
    },
    // La columna de lectura no se estira a todo el ancho en tablet — 560 px
    // máx., centrada entre los dos paneles (criterio 9 del spec: ningún
    // input se estira a todo el ancho).
    kavContainerTablet: {
      maxWidth: 560,
      alignSelf: "center",
      width: "100%",
    },
    // Spec 78, cambio de alcance (2026-08-28) — aviso persistente de
    // consentimiento pendiente. Tono `warning`, no `danger`: es una
    // obligación pendiente, no un error bloqueante.
    consentBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.warningBg,
      borderBottomWidth: 1,
      borderBottomColor: colors.warningFg,
    },
    // Hallazgo TC-078-011 (móvil, pantallas pequeñas): texto y botón
    // quedaban apretados en una sola fila. En teléfono (!isTablet) se apilan
    // en columna, con el botón ocupando el ancho completo.
    consentBannerCompact: {
      flexDirection: "column",
      alignItems: "stretch",
      gap: 8,
    },
    consentBannerText: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: colors.warningFg,
      flexShrink: 1,
      textAlign: "center",
    },
    consentBannerButton: {
      backgroundColor: colors.warningFg,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    consentBannerButtonCompact: {
      alignItems: "center",
    },
    consentBannerButtonText: {
      fontSize: 11,
      fontFamily: Fonts.bold,
      color: "#FFFFFF",
    },
    emptyState: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    emptyText: {
      fontFamily: Fonts.regular,
      fontSize: 16,
      color: colors.textMuted,
      textAlign: "center",
    },

    // 1. Header — patrón showBackHeader (mismo de pre-encuesta, spec 74
    // Fase 3): slot izquierdo/derecho de 48×48, título centrado.
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
    // Acción de índice reservada visualmente pero sin destino todavía — no
    // existe pantalla de índice/outline hasta la Fase 9 (Variante B).
    headerSlotDisabled: {
      opacity: 0.5,
    },
    headerTitleWrapper: { flex: 1, minWidth: 0, alignItems: "center" },
    headerTitle: {
      fontSize: 16,
      fontFamily: Fonts.extraBold,
      color: colors.textPrimary,
      textAlign: "center",
    },

    // 2. Chrome fusionado: acento + sección/contador/Guardado + progreso.
    // Un solo bloque de ~52 px (spec 74, Fase 4) en vez de los tres bloques
    // separados que había antes (header de marca, tarjeta de sección y
    // barra de progreso con su propio contenedor).
    chrome: {
      flexShrink: 0,
      backgroundColor: colors.surfaceMuted,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    chromeAccent: {
      height: 3,
      backgroundColor: colors.brand,
    },
    chromeBody: {
      paddingHorizontal: 20,
      paddingVertical: 9,
    },
    chromeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 7,
    },
    sectionName: {
      fontSize: 10,
      fontFamily: Fonts.extraBold,
      color: colors.brandSubtleFg,
      letterSpacing: 0.8,
      flex: 1,
      minWidth: 0,
    },
    counter: {
      fontSize: 10.5,
      fontFamily: Fonts.bold,
      color: colors.textMuted,
      flexShrink: 0,
    },
    savedChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexShrink: 0,
    },
    savedChipText: {
      fontSize: 10,
      fontFamily: Fonts.bold,
      color: colors.successFg,
    },
    progressTrack: {
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 99,
      overflow: "hidden",
    },
    progressFill: {
      height: 4,
      backgroundColor: colors.brand,
      borderRadius: 99,
    },

    // Scroll
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 24,
    },
    ownScrollContainer: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 8,
    },

    // 4. Footer: «Anterior» reducido a botón de ícono de 62 px, «Siguiente»
    // dominante con flecha (spec 74, Fase 4).
    footer: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    prevButton: {
      width: 62,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 11,
    },
    nextButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      backgroundColor: colors.brand,
      borderRadius: 11,
      paddingVertical: 17,
    },
    nextButtonDisabled: {
      backgroundColor: colors.surfaceMuted,
    },
    nextButtonText: {
      fontSize: 15.5,
      fontFamily: Fonts.extraBold,
      color: colors.brandForeground,
    },
    nextButtonTextDisabled: {
      color: colors.textMuted,
    },
  });
}
