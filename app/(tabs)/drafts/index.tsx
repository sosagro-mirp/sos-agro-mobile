import { useState, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Trash2 } from "lucide-react-native";
import { surveyDraftStore, type SurveyDraft } from "../../../src/storage/surveyDraftStore";
import { instrumentCacheStorage } from "../../../src/storage/instrumentCache";
import { farmerCacheStorage } from "../../../src/storage/farmerCache";
import { useInstrumentSurveyStore } from "../../../src/store/useInstrumentSurveyStore";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";

interface EnrichedDraft extends SurveyDraft {
  instrumentName: string | null;
  farmerName: string | null;
}

async function enrichDraft(draft: SurveyDraft): Promise<EnrichedDraft> {
  const [instrument, farmer] = await Promise.all([
    instrumentCacheStorage.get(draft.instrumentId).catch(() => null),
    draft.farmerId ? farmerCacheStorage.get(draft.farmerId).catch(() => null) : Promise.resolve(null),
  ]);

  const farmerName = farmer ? farmer.name : null;

  return {
    ...draft,
    instrumentName: instrument?.name ?? null,
    farmerName,
  };
}

export default function DraftsScreen() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<EnrichedDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    body: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      setError(null);
      surveyDraftStore
        .listDrafts()
        .then((raw) => Promise.all(raw.map(enrichDraft)))
        .then(setDrafts)
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Error cargando borradores")
        )
        .finally(() => setIsLoading(false));
    }, [])
  );

  const closeModal = () => {
    if (modalLoading) return;
    setConfirmModal(null);
  };

  const runModal = async () => {
    if (!confirmModal || modalLoading) return;
    setModalLoading(true);
    setError(null);
    try {
      await confirmModal.onConfirm();
      setConfirmModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setConfirmModal(null);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = (draft: EnrichedDraft) => {
    setConfirmModal({
      title: "Eliminar borrador",
      body: `Se eliminará "${draft.instrumentName ?? "este borrador"}" y todas sus respuestas. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      onConfirm: async () => {
        setDeletingId(draft.surveyId);
        await surveyDraftStore.deleteDraft(draft.surveyId);
        setDrafts((prev) => prev.filter((d: EnrichedDraft) => d.surveyId !== draft.surveyId));
        setDeletingId(null);
      },
    });
  };

  const handleClearAll = () => {
    setConfirmModal({
      title: "Limpiar borradores",
      body: `Se eliminarán los ${drafts.length} borradores y todas sus respuestas. Esta acción no se puede deshacer.`,
      confirmLabel: "Limpiar todo",
      onConfirm: async () => {
        setIsLoading(true);
        await Promise.all(drafts.map((d) => surveyDraftStore.deleteDraft(d.surveyId)));
        setDrafts([]);
        setIsLoading(false);
      },
    });
  };

  const handleResume = async (draft: EnrichedDraft) => {
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

      // Spec 69 — el índice de reanudación se lee del store *después* de
      // inicializarlo, en vez de calcularse acá por su cuenta: es la misma
      // fuente (`resolveResumeIndex` sobre `visibleQuestions()` + `answers`)
      // que usa la pantalla de pregunta, así que no puede divergir.
      useInstrumentSurveyStore.getState().initializeSurvey({
        surveyId: draft.surveyId,
        instrumentId: instrument.instrumentId,
        instrumentName: instrument.name,
        sections: instrument.sections,
        campaignSessionId: draft.campaignSessionId,
        // Sin esto la encuesta se materializa con `stepOrder: null` y
        // `getNextStep()` no cuenta el paso como completado, así que la
        // campaña vuelve a ofrecer un instrumento ya respondido (hallazgo de
        // la ronda de campo del 2026-08-18).
        stepOrder: draft.stepOrder,
        restoredAnswers: draft.answers,
      });

      const resumeIndex = useInstrumentSurveyStore.getState().resumeIndex();

      if (resumeIndex === -1) {
        router.push(`/instrument/${instrument.instrumentId}/review`);
      } else {
        router.push(`/instrument/${instrument.instrumentId}/question/${resumeIndex}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reanudar borrador");
    } finally {
      setResumingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={[]}>
      <View style={styles.header}>
        <Text style={styles.title}>Borradores</Text>
        {drafts.length > 0 && !isLoading ? (
          <Pressable onPress={handleClearAll} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Limpiar todo</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.list}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.brand} style={styles.loader} />
        ) : drafts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Sin borradores</Text>
            <Text style={styles.emptyDesc}>
              Las encuestas en progreso aparecerán aquí.
            </Text>
          </View>
        ) : (
          drafts.map((draft: EnrichedDraft) => (
            <DraftCard
              key={draft.surveyId}
              draft={draft}
              isResuming={resumingId === draft.surveyId}
              isDeleting={deletingId === draft.surveyId}
              onResume={() => handleResume(draft)}
              onDelete={() => handleDelete(draft)}
            />
          ))
        )}
      </ScrollView>

      <Modal
        visible={confirmModal !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeModal}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{confirmModal?.title}</Text>
            <Text style={styles.modalBody}>{confirmModal?.body}</Text>

            {modalLoading ? (
              <ActivityIndicator size="large" color={colors.dangerFg} style={styles.modalSpinner} />
            ) : (
              <>
                <Pressable style={[styles.modalBtn, styles.modalBtnDestructive]} onPress={runModal}>
                  <Text style={styles.modalBtnText}>{confirmModal?.confirmLabel}</Text>
                </Pressable>
                <Pressable style={[styles.modalBtn, styles.modalBtnSecondary]} onPress={closeModal}>
                  <Text style={[styles.modalBtnText, styles.modalBtnSecondaryText]}>Cancelar</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DraftCard({
  draft,
  isResuming,
  isDeleting,
  onResume,
  onDelete,
}: {
  draft: EnrichedDraft;
  isResuming: boolean;
  isDeleting: boolean;
  onResume: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const answerCount = Object.keys(draft.answers).length;
  const disabled = isResuming || isDeleting;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && !disabled && styles.cardPressed]}
      onPress={onResume}
      disabled={disabled}
      accessibilityRole="button"
    >
      <View style={styles.cardTop}>
        <View style={styles.cardMain}>
          <Text style={styles.instrumentName} numberOfLines={2}>
            {draft.instrumentName ?? "Instrumento no disponible"}
          </Text>
          <View style={styles.badges}>
            {draft.campaignSessionId ? (
              <View style={styles.campaignBadge}>
                <Text style={styles.campaignBadgeText}>En campaña</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.cardActions}>
          {isResuming ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : isDeleting ? (
            <ActivityIndicator size="small" color={colors.dangerFg} />
          ) : (
            <>
              <Text style={styles.resumeHint}>Continuar →</Text>
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); onDelete(); }}
                style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
                hitSlop={8}
                accessibilityLabel="Eliminar borrador"
              >
                <Trash2 size={18} color={colors.dangerFg} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      {draft.farmerName ? (
        <Text style={styles.farmerName} numberOfLines={1}>
          Agricultor: {draft.farmerName}
        </Text>
      ) : null}

      <View style={styles.metaRow}>
        <Text style={styles.answers}>
          {answerCount} respuesta{answerCount !== 1 ? "s" : ""}
        </Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.date}>
          {draft.updatedAt.toLocaleString("es-CO", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </Text>
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: { fontSize: 17, fontFamily: Fonts.bold, color: colors.textPrimary },
    clearBtn: { paddingVertical: 4, paddingHorizontal: 8 },
    clearBtnText: { fontSize: 14, fontFamily: Fonts.semiBold, color: colors.dangerFg },
    errorBox: {
      margin: 16,
      padding: 12,
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    errorText: { fontSize: 14, fontFamily: Fonts.regular, color: colors.dangerFg },
    list: { padding: 20, gap: 12 },
    loader: { marginTop: 48 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
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
    cardActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    deleteBtn: { padding: 2 },
    deleteBtnPressed: { opacity: 0.5 },
    instrumentName: { fontSize: 15, fontFamily: Fonts.semiBold, color: colors.textPrimary, lineHeight: 20 },
    badges: { flexDirection: "row", gap: 6 },
    campaignBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.successBg,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    campaignBadgeText: { fontSize: 11, fontFamily: Fonts.semiBold, color: colors.successFg },
    farmerName: { fontSize: 13, fontFamily: Fonts.semiBold, color: colors.textPrimary },
    resumeHint: { fontSize: 13, fontFamily: Fonts.semiBold, color: colors.brand },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    answers: { fontSize: 12, fontFamily: Fonts.regular, color: colors.textMuted },
    dot: { fontSize: 12, color: colors.borderStrong },
    date: { fontSize: 12, fontFamily: Fonts.regular, color: colors.textMuted },
    empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
    emptyTitle: { fontSize: 17, fontFamily: Fonts.semiBold, color: colors.textPrimary },
    emptyDesc: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      textAlign: "center",
    },
    overlay: {
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
    modalTitle: { fontSize: 18, fontFamily: Fonts.bold, color: colors.textPrimary },
    modalBody: { fontSize: 15, fontFamily: Fonts.regular, color: colors.textPrimary, lineHeight: 22 },
    modalSpinner: { marginVertical: 16 },
    modalBtn: { borderRadius: 12, paddingVertical: 16, alignItems: "center" },
    modalBtnDestructive: { backgroundColor: colors.dangerFg },
    modalBtnSecondary: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
    modalBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: colors.brandForeground },
    modalBtnSecondaryText: { color: colors.textPrimary },
  });
}
