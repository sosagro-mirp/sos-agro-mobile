import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
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
import type { InstrumentDraftAnswer } from "../../types";

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
        </View>
      </SafeAreaView>
    );
  }

  const currentAnswer = answers[currentItem.question.questionId];

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <OfflineBanner />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handlePrev}
          style={styles.backButton}
          disabled={isFirst}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.backChevron, isFirst && styles.backChevronDisabled]}>
            ←
          </Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.sectionName} numberOfLines={1}>
            {currentItem.sectionName}
          </Text>
          <Text style={styles.counter}>
            {currentIndex + 1} de {total}
          </Text>
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

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <ProgressBar current={currentIndex + 1} total={total} />
      </View>

      {/* Question */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <QuestionContainer question={currentItem.question}>
          <QuestionRenderer
            item={currentItem}
            answer={currentAnswer}
            onChange={handleChange}
          />
        </QuestionContainer>
      </ScrollView>

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

      {/* Footer */}
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
    </SafeAreaView>
  );
};

export default QuestionScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F9FAFB",
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
    color: "#6B7280",
    textAlign: "center",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backChevron: {
    fontSize: 24,
    color: "#1B6B3A",
    fontFamily: Fonts.bold,
  },
  backChevronDisabled: {
    color: "#D1D5DB",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  sectionName: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: "#111827",
  },
  counter: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  exitButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  exitIcon: {
    fontSize: 18,
    color: "#9CA3AF",
    fontFamily: Fonts.regular,
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
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#111827",
  },
  modalBody: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#374151",
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
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modalButtonDestructive: {
    backgroundColor: "#DC2626",
  },
  modalButtonText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  modalButtonSecondaryText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: "#374151",
  },

  // Progress
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
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

  // Footer
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
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
