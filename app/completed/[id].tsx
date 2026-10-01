import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, WifiOff } from "lucide-react-native";
import { getSurveyResponses } from "../../src/api/surveys";
import { instrumentCacheStorage } from "../../src/storage/instrumentCache";
import { secureStorage } from "../../src/storage/secureStorage";
import { surveyDraftStore } from "../../src/storage/surveyDraftStore";
import { useSyncStatusStore } from "../../src/store/useSyncStatusStore";
import { buildReadOnlyAnswers, MISSING_OPTION_LABEL } from "../../src/lib/buildReadOnlyAnswers";
import { groupRemoteResponses } from "../../src/lib/groupRemoteResponses";
import { formatCompletedDate } from "../../src/components/completed/CompletedSurveyCard";
import { AppText } from "../../src/components/common/AppText";
import { EmptyState } from "../../src/components/common/EmptyState";
import { Skeleton } from "../../src/components/common/Skeleton";
import { Fonts } from "../../src/theme/fonts";
import { useTheme } from "../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../src/theme/colors";

interface DetailRow {
  questionId: string;
  questionText: string;
  displayValue: string;
}

interface DetailSection {
  sectionId: string;
  title: string;
  rows: DetailRow[];
}

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; sections: DetailSection[] }
  | { kind: "unavailable" };

/**
 * Detalle de solo lectura de una encuesta realizada (spec 92, Alcance 5).
 * Tres caminos, en orden: el dispositivo (si la encuesta y su instrumento
 * siguen ahí), el servidor (con conexión e id del servidor) y, si ninguno
 * aplica, el aviso de que el detalle no está disponible sin conexión.
 */
export default function CompletedSurveyDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    source?: string;
    surveyId?: string;
    instrumentName?: string;
    farmerName?: string;
    date?: string;
    dateSource?: string;
  }>();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isOnline = useSyncStatusStore((s) => s.isOnline);
  const [state, setState] = useState<DetailState>({ kind: "loading" });

  const localId = params.source === "local" ? params.id : undefined;
  const remoteId = params.surveyId ?? (params.source === "remote" ? params.id : undefined);

  useEffect(() => {
    let cancelled = false;
    let localFallback: DetailSection[] | null = null;

    async function loadLocal(): Promise<DetailSection[] | null> {
      if (!localId) return null;
      const [draft, activeUserId] = await Promise.all([
        surveyDraftStore.loadDraft(localId),
        secureStorage.getActiveUserId(),
      ]);
      if (!draft || Object.keys(draft.answers).length === 0) return null;
      // Misma regla de dueño que la lista: del encuestador activo o sin dueño.
      if (draft.ownerUserId && activeUserId && draft.ownerUserId !== activeUserId) return null;
      const instrument = await instrumentCacheStorage.get(draft.instrumentId);
      if (!instrument) return null;
      const sections = buildReadOnlyAnswers(instrument.sections, draft.answers).map((s) => ({
        sectionId: s.sectionId,
        title: s.sectionName,
        rows: s.rows,
      }));
      // Una opción «Otro» ya sincronizada por una versión anterior perdió su
      // texto y su id no está en la caché: con conexión, el servidor la resuelve.
      const hasUnresolved = sections.some((sec) => sec.rows.some((r) => r.displayValue.includes(MISSING_OPTION_LABEL)));
      if (hasUnresolved && remoteId && isOnline) {
        localFallback = sections;
        return null;
      }
      return sections;
    }

    async function loadRemote(): Promise<DetailSection[] | null> {
      if (!remoteId || !isOnline) return null;
      const rows = await getSurveyResponses(remoteId);
      return groupRemoteResponses(rows).map((s) => ({
        sectionId: s.sectionId,
        title: s.sectionTitle,
        rows: s.rows,
      }));
    }

    (async () => {
      let sections: DetailSection[] | null = null;
      try {
        sections = await loadLocal();
      } catch {
        sections = null;
      }
      if (!sections) {
        try {
          sections = await loadRemote();
        } catch {
          sections = null;
        }
      }
      if (!sections && localFallback) sections = localFallback;
      if (cancelled) return;
      setState(sections ? { kind: "ready", sections } : { kind: "unavailable" });
    })();

    return () => {
      cancelled = true;
    };
  }, [localId, remoteId, isOnline]);

  const date =
    params.date && (params.dateSource === "local" || params.dateSource === "server")
      ? formatCompletedDate({ date: params.date, dateSource: params.dateSource })
      : null;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver a encuestas realizadas"
        >
          <ChevronLeft size={21} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <AppText style={styles.title} numberOfLines={2}>
            {params.instrumentName || "Instrumento no disponible"}
          </AppText>
          <AppText style={styles.subtitle} numberOfLines={1}>
            {params.farmerName || "Productor no disponible"}
            {date ? ` · ${date}` : ""}
          </AppText>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {state.kind === "loading" ? (
          <View style={styles.skeletons}>
            <Skeleton width="40%" height={12} />
            <Skeleton height={44} borderRadius={12} />
            <Skeleton height={44} borderRadius={12} />
            <Skeleton height={44} borderRadius={12} />
          </View>
        ) : state.kind === "unavailable" ? (
          <EmptyState
            icon={WifiOff}
            title="Detalle no disponible"
            description="El detalle de esta encuesta no está disponible sin conexión"
          />
        ) : (
          state.sections.map((section) => (
            <View key={section.sectionId} style={styles.section}>
              <AppText style={styles.sectionTitle}>{section.title.toUpperCase()}</AppText>
              <View style={styles.card}>
                {section.rows.map((row, index) => (
                  <View key={row.questionId} style={[styles.row, index > 0 && styles.rowDivider]}>
                    <AppText style={styles.question}>{row.questionText}</AppText>
                    <AppText style={styles.answer}>{row.displayValue}</AppText>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
    headerText: { flex: 1, minWidth: 0 },
    title: { fontSize: 16, fontFamily: Fonts.extraBold, color: colors.textPrimary },
    subtitle: { fontSize: 11.5, fontFamily: Fonts.regular, color: colors.textMuted, marginTop: 2 },
    content: { padding: 14, gap: 16, flexGrow: 1 },
    skeletons: { gap: 12 },
    section: { gap: 8 },
    sectionTitle: { fontSize: 10, fontFamily: Fonts.extraBold, color: colors.textMuted, letterSpacing: 0.6 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    row: { padding: 14, gap: 4 },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    question: { fontSize: 11.5, fontFamily: Fonts.regular, color: colors.textMuted, lineHeight: 17 },
    answer: { fontSize: 14.5, fontFamily: Fonts.medium, color: colors.textPrimary, lineHeight: 20 },
  });
}
