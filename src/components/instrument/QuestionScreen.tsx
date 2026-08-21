import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useInstrumentSurveyStore } from "../../store/useInstrumentSurveyStore";
import { OfflineBanner } from "../network/OfflineBanner";
import { ProgressBar } from "./ProgressBar";
import { QuestionContainer } from "./QuestionContainer";
import { QuestionRenderer } from "./QuestionRenderer";
import { PrimaryButton } from "../common/PrimaryButton";
import { SecondaryButton } from "../common/SecondaryButton";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import { OPTION_SEARCH_THRESHOLD } from "../../lib/optionSearch";
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

  const answers = useInstrumentSurveyStore((s) => s.answers);
  const currentIndex = useInstrumentSurveyStore((s) => s.currentIndex);
  const setAnswer = useInstrumentSurveyStore((s) => s.setAnswer);
  const goToNext = useInstrumentSurveyStore((s) => s.goToNext);
  const goToPrev = useInstrumentSurveyStore((s) => s.goToPrev);
  const canAdvance = useInstrumentSurveyStore((s) => s.canAdvance);
  const visibleQuestions = useInstrumentSurveyStore((s) => s.visibleQuestions);

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

  const handleNext = () => {
    if (isLast) {
      onFinished();
      return;
    }
    goToNext();
    router.push(`/instrument/${instrumentId}/question/${currentIndex + 1}`);
  };

  const handlePrev = () => {
    if (isFirst) return;
    goToPrev();
    router.back();
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

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <OfflineBanner />

      <KeyboardAvoidingView
        style={styles.kavContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "android" ? -24 : 0}
      >
        {/* 1. Header: marca + botón salir */}
        <View style={styles.header}>
          <View style={styles.brand}>
            <Text style={styles.brandTitle}>SosAgro 4.C</Text>
            <Text style={styles.brandSubtitle}>Plataforma de Caracterización Agrícola</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowExitConfirm(true)}
            style={styles.exitButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Salir de la encuesta"
          >
            <Text style={styles.exitIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* 2. Sección */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionName} numberOfLines={2}>
            {currentItem.sectionName}
          </Text>
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

        {/* 4. Barra de progreso */}
        <View style={styles.progressContainer}>
          <ProgressBar current={currentIndex + 1} total={total} />
        </View>

        {/* 5. Footer: navegación */}
        <View style={styles.footer}>
          {!isFirst && (
            <View style={styles.prevButtonWrapper}>
              <SecondaryButton label="Anterior" onPress={handlePrev} />
            </View>
          )}
          <View style={[styles.nextButtonWrapper, isFirst && styles.nextButtonFull]}>
            <PrimaryButton
              label={isLast ? "Finalizar" : "Siguiente"}
              onPress={handleNext}
              disabled={!canAdvance()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Modal de confirmación de salida */}
      <Modal
        visible={showExitConfirm}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowExitConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>¿Salir de la encuesta?</Text>
            <Text style={styles.modalBody}>
              La encuesta está sin terminar. Las respuestas guardadas quedarán como borrador y podrás reanudarla más tarde.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setShowExitConfirm(false)}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonDestructive]}
                onPress={() => {
                  setShowExitConfirm(false);
                  router.replace("/(tabs)/campaign");
                }}
              >
                <Text style={styles.modalButtonText}>Salir</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    kavContainer: {
      flex: 1,
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

    // 1. Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    brand: {
      flex: 1,
      alignItems: "center",
    },
    brandTitle: {
      fontFamily: Fonts.bold,
      fontSize: 17,
      color: colors.brand,
      letterSpacing: 1.5,
      textTransform: "uppercase",
    },
    brandSubtitle: {
      fontFamily: Fonts.regular,
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    exitButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      position: "absolute",
      right: 12,
    },
    exitIcon: {
      fontSize: 16,
      color: colors.textMuted,
      fontFamily: Fonts.regular,
    },

    // 2. Sección
    sectionCard: {
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      overflow: "hidden",
    },
    sectionAccent: {
      height: 3,
      backgroundColor: colors.brand,
    },
    sectionName: {
      fontFamily: Fonts.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      paddingHorizontal: 20,
      paddingVertical: 10,
    },

    // Exit confirmation modal
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    modalCard: {
      width: "100%",
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      gap: 12,
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: Fonts.bold,
      color: colors.textPrimary,
    },
    modalBody: {
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    modalActions: {
      flexDirection: "row",
      gap: 12,
      marginTop: 4,
    },
    modalButton: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
    },
    modalButtonSecondary: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalButtonDestructive: {
      backgroundColor: colors.dangerFg,
    },
    modalButtonText: {
      fontSize: 15,
      fontFamily: Fonts.semiBold,
      color: colors.brandForeground,
    },
    modalButtonSecondaryText: {
      fontSize: 15,
      fontFamily: Fonts.semiBold,
      color: colors.textPrimary,
    },

    // Progress
    progressContainer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
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

    // Footer
    footer: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    prevButtonWrapper: {
      flex: 1,
    },
    nextButtonWrapper: {
      flex: 1,
    },
    nextButtonFull: {
      flex: 1,
    },
  });
}
