import { useState, useCallback, useMemo } from "react";
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
import { FileText, User, Trash2, ArrowRight } from "lucide-react-native";
import { surveyDraftStore, type SurveyDraft } from "../../../src/storage/surveyDraftStore";
import { instrumentCacheStorage } from "../../../src/storage/instrumentCache";
import { farmerCacheStorage } from "../../../src/storage/farmerCache";
import { useInstrumentSurveyStore } from "../../../src/store/useInstrumentSurveyStore";
import { useDraftCountStore } from "../../../src/store/useDraftCountStore";
import { AppText } from "../../../src/components/common/AppText";
import { DestructiveButton } from "../../../src/components/common/DestructiveButton";
import { ConfirmSheet } from "../../../src/components/common/ConfirmSheet";
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
      // Fuente reactiva del badge en la pestaña (spec 74, deuda diferida de
      // la Fase 3 a esta fase) — se refresca en cada foco, no solo acá.
      useDraftCountStore.getState().refresh();
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
    const answerCount = Object.keys(draft.answers).length;
    const who = draft.farmerName ? ` de ${draft.farmerName}` : "";
    setConfirmModal({
      body: `Se pierden las ${answerCount} respuesta${answerCount !== 1 ? "s" : ""} ya cargadas${who}. No se puede deshacer.`,
      confirmLabel: "Borrar de todas formas",
      onConfirm: async () => {
        setDeletingId(draft.surveyId);
        await surveyDraftStore.deleteDraft(draft.surveyId);
        setDrafts((prev) => prev.filter((d: EnrichedDraft) => d.surveyId !== draft.surveyId));
        setDeletingId(null);
        useDraftCountStore.getState().refresh();
      },
    });
  };

  const handleClearAll = () => {
    setConfirmModal({
      body: `Se eliminarán los ${drafts.length} borradores y todas sus respuestas. No se puede deshacer.`,
      confirmLabel: "Borrar de todas formas",
      onConfirm: async () => {
        setIsLoading(true);
        await Promise.all(drafts.map((d) => surveyDraftStore.deleteDraft(d.surveyId)));
        setDrafts([]);
        setIsLoading(false);
        useDraftCountStore.getState().refresh();
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
        <View style={styles.headerTitleWrapper}>
          <Text style={styles.title}>Borradores</Text>
          <Text style={styles.subtitle}>
            {isLoading
              ? " "
              : drafts.length === 0
                ? "Sin borradores"
                : `${drafts.length} encuesta${drafts.length !== 1 ? "s" : ""} sin terminar`}
          </Text>
        </View>
        {drafts.length > 0 && !isLoading ? (
          <DestructiveButton label="Limpiar" icon={Trash2} onPress={handleClearAll} compact />
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
            <View style={styles.emptyIconWrapper}>
              <FileText size={26} color={colors.textMuted} strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyTitle}>No hay borradores</Text>
            <Text style={styles.emptyDesc}>
              Las encuestas que dejes a medio responder quedan acá para retomarlas.
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

      <ConfirmSheet
        visible={confirmModal !== null}
        icon={Trash2}
        tone="danger"
        title="¿Borrar este borrador?"
        body={confirmModal?.body ?? ""}
        isLoading={modalLoading}
        secondaryAction={{ label: "Conservar borrador", onPress: closeModal }}
        destructiveAction={
          confirmModal
            ? { label: confirmModal.confirmLabel, icon: Trash2, onPress: runModal }
            : undefined
        }
        onRequestClose={closeModal}
      />
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
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.instrumentName} numberOfLines={2}>
            {draft.instrumentName ?? "Instrumento no disponible"}
          </Text>
          {draft.campaignSessionId ? (
            <View style={styles.campaignBadge}>
              <Text style={styles.campaignBadgeText}>EN CAMPAÑA</Text>
            </View>
          ) : null}
        </View>

        {draft.farmerName ? (
          <View style={styles.farmerRow}>
            <User size={13} color={colors.textMuted} strokeWidth={2.2} />
            <Text style={styles.farmerName} numberOfLines={1}>{draft.farmerName}</Text>
          </View>
        ) : null}

        <Text style={styles.metaText}>
          {answerCount} respuesta{answerCount !== 1 ? "s" : ""} ·{" "}
          {draft.updatedAt.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
        </Text>
      </View>

      <View style={styles.cardActions}>
        <Pressable
          style={({ pressed }) => [styles.continueBtn, pressed && !disabled && styles.continueBtnPressed]}
          onPress={onResume}
          disabled={disabled}
          accessibilityRole="button"
        >
          {isResuming ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : (
            <>
              <AppText style={styles.continueText}>Continuar</AppText>
              <ArrowRight size={17} color={colors.brand} strokeWidth={2.6} />
            </>
          )}
        </Pressable>
        <View style={styles.actionsDivider} />
        <Pressable
          onPress={onDelete}
          disabled={disabled}
          style={({ pressed }) => [styles.deleteBtn, pressed && !disabled && styles.continueBtnPressed]}
          accessibilityLabel="Eliminar borrador"
          accessibilityRole="button"
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={colors.dangerFg} />
          ) : (
            <Trash2 size={18} color={colors.dangerFg} strokeWidth={2.2} />
          )}
        </Pressable>
      </View>
    </View>
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
      gap: 12,
    },
    headerTitleWrapper: { flex: 1, minWidth: 0 },
    title: { fontSize: 19, fontFamily: Fonts.extraBold, color: colors.textPrimary, letterSpacing: -0.3 },
    subtitle: { fontSize: 11.5, fontFamily: Fonts.regular, color: colors.textMuted, marginTop: 3 },
    errorBox: {
      margin: 16,
      padding: 12,
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    errorText: { fontSize: 14, fontFamily: Fonts.regular, color: colors.dangerFg },
    list: { padding: 14, gap: 12 },
    loader: { marginTop: 48 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    cardTop: { padding: 14, paddingBottom: 12, gap: 5 },
    cardHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginBottom: 4 },
    instrumentName: { flex: 1, fontSize: 13.5, fontFamily: Fonts.bold, color: colors.textPrimary, lineHeight: 18 },
    campaignBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.infoBg,
      borderRadius: 99,
      paddingHorizontal: 8,
      paddingVertical: 3,
      flexShrink: 0,
    },
    campaignBadgeText: { fontSize: 9.5, fontFamily: Fonts.extraBold, color: colors.infoFg },
    farmerRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    farmerName: { fontSize: 11.5, fontFamily: Fonts.regular, color: colors.textMuted },
    metaText: { fontSize: 11, fontFamily: Fonts.regular, color: colors.textMuted },
    cardActions: {
      flexDirection: "row",
      alignItems: "stretch",
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    continueBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minHeight: 48,
    },
    continueBtnPressed: { opacity: 0.6 },
    continueText: { fontSize: 13.5, fontFamily: Fonts.extraBold, color: colors.brand },
    actionsDivider: { width: 1, backgroundColor: colors.border },
    deleteBtn: {
      width: 58,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
    },
    empty: { alignItems: "center", paddingVertical: 70, paddingHorizontal: 20, gap: 0 },
    emptyIconWrapper: {
      width: 60,
      height: 60,
      borderRadius: 16,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 18,
    },
    emptyTitle: { fontSize: 16, fontFamily: Fonts.extraBold, color: colors.textPrimary, marginBottom: 9 },
    emptyDesc: {
      fontSize: 12.5,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 19,
    },
  });
}
