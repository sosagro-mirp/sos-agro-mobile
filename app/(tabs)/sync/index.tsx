import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Check,
  CircleAlert,
  LoaderCircle,
  Image as ImageIcon,
  Mic,
  FileText,
  Paperclip,
  RefreshCw,
  Trash2,
} from "lucide-react-native";
import { useSnackbar } from "../../../src/components/common/Snackbar";
import { DestructiveButton } from "../../../src/components/common/DestructiveButton";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { syncQueueStorage, type SyncQueueEntry } from "../../../src/storage/syncQueue";
import {
  mediaUploadQueueStorage,
  type MediaUploadEntry,
} from "../../../src/storage/mediaUploadQueueStorage";
import { surveyDraftStore } from "../../../src/storage/surveyDraftStore";
import { NetworkMonitor } from "../../../src/sync/NetworkMonitor";
import { MediaUploadService } from "../../../src/sync/MediaUploadService";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";
import { logger } from "../../../src/lib/logger";

function attachmentIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.startsWith("audio/")) return Mic;
  return FileText;
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// Ícono girando con `Animated` en vez de `ActivityIndicator` (spec 74, mapa
// de reemplazo). Copia local del mismo patrón que login/GPS/orquestador.
function SpinningLoader({ size, color }: { size: number; color: string }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <LoaderCircle size={size} color={color} />
    </Animated.View>
  );
}

export default function SyncScreen() {
  const {
    isOnline,
    pendingCount,
    lastSyncAt,
    currentlySyncingId,
    refreshPendingCount,
  } = useSyncStatusStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show: showSnackbar } = useSnackbar();

  const [failedEntries, setFailedEntries] = useState<SyncQueueEntry[]>([]);
  const [failedMedia, setFailedMedia] = useState<MediaUploadEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingMediaId, setRetryingMediaId] = useState<string | null>(null);
  const [purgeResult, setPurgeResult] = useState<number | null>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [isClearingFailed, setIsClearingFailed] = useState(false);
  const [isClearingFailedMedia, setIsClearingFailedMedia] = useState(false);

  const refreshData = async () => {
    await refreshPendingCount();
    const failed = await syncQueueStorage.listFailed();
    setFailedEntries(failed);
    const failedMediaEntries = await mediaUploadQueueStorage.listFailed();
    setFailedMedia(failedMediaEntries);
  };

  useEffect(() => {
    refreshData().catch((err) => logger.error('[Sync] refreshData failed', err));
  }, []);

  useEffect(() => {
    if (lastSyncAt) {
      refreshData().catch((err) => logger.error('[Sync] refreshData failed', err));
    }
  }, [lastSyncAt]);

  const handleSyncNow = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      await NetworkMonitor.checkAndSync();
      await refreshData();
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePurge = async () => {
    if (isPurging) return;
    setIsPurging(true);
    setPurgeResult(null);
    try {
      const count = await surveyDraftStore.purgeSyncedSurveys();
      setPurgeResult(count);
    } finally {
      setIsPurging(false);
    }
  };

  const handleClearFailed = async () => {
    if (isClearingFailed) return;
    setIsClearingFailed(true);
    try {
      await syncQueueStorage.clearFailed();
      setFailedEntries([]);
      await refreshPendingCount();
    } finally {
      setIsClearingFailed(false);
    }
  };

  const handleRetry = async (entry: SyncQueueEntry) => {
    if (!isOnline || retryingId) return;
    setRetryingId(entry.id);
    try {
      await syncQueueStorage.resetToRetry(entry.id);
      await NetworkMonitor.checkAndSync();
      await refreshData();
    } finally {
      setRetryingId(null);
    }
  };

  const handleClearFailedMedia = async () => {
    if (isClearingFailedMedia) return;
    setIsClearingFailedMedia(true);
    try {
      await mediaUploadQueueStorage.clearFailed();
      setFailedMedia([]);
    } finally {
      setIsClearingFailedMedia(false);
    }
  };

  const handleRetryMedia = async (entry: MediaUploadEntry) => {
    if (!isOnline || retryingMediaId) return;
    setRetryingMediaId(entry.id);
    try {
      await MediaUploadService.retryEntry(entry.id, entry.questionId, entry.surveyId);
      await refreshData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo reintentar el adjunto.';
      showSnackbar({ message, variant: 'error' });
    } finally {
      setRetryingMediaId(null);
    }
  };

  const isBusy = isSyncing || Boolean(currentlySyncingId);
  const statusColor = isOnline ? colors.successFg : colors.dangerFg;
  const statusLabel = isOnline ? "En línea" : "Sin conexión";
  const allDone = pendingCount === 0 && failedEntries.length === 0 && failedMedia.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={[]}>
      <View style={styles.header}>
        <Text style={styles.title}>Sincronización</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusCard, !isOnline && styles.statusCardOffline]}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusLabel, { color: statusColor }]}>
              {statusLabel}
            </Text>
            {isBusy ? <SpinningLoader size={16} color={colors.brand} /> : null}
          </View>
          {currentlySyncingId ? (
            <Text style={styles.syncingDetail} numberOfLines={1}>
              Enviando encuesta…
            </Text>
          ) : lastSyncAt ? (
            <Text style={styles.lastSync}>
              Última sync: {lastSyncAt.toLocaleTimeString("es-CO")}
            </Text>
          ) : (
            <Text style={styles.lastSync}>Sin sincronizaciones en esta sesión</Text>
          )}
        </View>

        <View style={styles.countersRow}>
          <CounterCard label="Pendientes" value={pendingCount} tone="warning" />
          <CounterCard label="Con error" value={failedEntries.length} tone="danger" />
          <CounterCard label="Adjuntos" value={failedMedia.length} tone="danger" />
        </View>

        {allDone ? (
          <View style={styles.allGood}>
            <Check size={34} color={colors.successFg} strokeWidth={2.6} />
            <Text style={styles.allGoodText}>Todo sincronizado</Text>
            <Text style={styles.allGoodDesc}>No hay encuestas ni adjuntos en cola.</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.syncButton, (!isOnline || isBusy) && styles.syncButtonDisabled]}
            onPress={handleSyncNow}
            disabled={!isOnline || isBusy}
            accessibilityRole="button"
          >
            {isBusy ? (
              <ActivityIndicator color={colors.brandForeground} />
            ) : (
              <>
                <RefreshCw size={18} color={colors.brandForeground} strokeWidth={2.4} />
                <Text style={styles.syncButtonText}>Sincronizar ahora</Text>
              </>
            )}
          </Pressable>
        )}

        {failedEntries.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <CircleAlert size={15} color={colors.dangerFg} strokeWidth={2.4} />
              <Text style={styles.sectionTitleDanger}>
                ERRORES DE VALIDACIÓN ({failedEntries.length})
              </Text>
              <Pressable onPress={handleClearFailed} disabled={isClearingFailed}>
                {isClearingFailed ? (
                  <ActivityIndicator size="small" color={colors.dangerFg} />
                ) : (
                  <Text style={styles.clearFailedBtn}>Limpiar</Text>
                )}
              </Pressable>
            </View>
            {failedEntries.map((entry) => (
              <View key={entry.id} style={styles.failedCard}>
                <View style={styles.failedCardBody}>
                  <Text style={styles.failedId} numberOfLines={1}>
                    {entry.surveyId}
                  </Text>
                  {entry.errorDetail ? (
                    <Text style={styles.failedError}>{entry.errorDetail}</Text>
                  ) : null}
                </View>
                <View style={styles.failedFooter}>
                  <Text style={styles.failedAttempts} numberOfLines={1}>
                    {entry.id} · {entry.attempts} intento{entry.attempts !== 1 ? "s" : ""}
                  </Text>
                  <Pressable
                    style={styles.retryBtn}
                    onPress={() => handleRetry(entry)}
                    disabled={!isOnline || Boolean(retryingId)}
                    accessibilityRole="button"
                  >
                    {retryingId === entry.id ? (
                      <ActivityIndicator size="small" color={colors.dangerFg} />
                    ) : (
                      <>
                        <RefreshCw size={15} color={colors.dangerFg} strokeWidth={2.4} />
                        <Text style={styles.retryBtnText}>Reintentar</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {failedMedia.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Paperclip size={15} color={colors.warningFg} strokeWidth={2.4} />
              <Text style={styles.sectionTitleWarning}>
                ADJUNTOS SIN SUBIR ({failedMedia.length})
              </Text>
              <Pressable onPress={handleClearFailedMedia} disabled={isClearingFailedMedia}>
                {isClearingFailedMedia ? (
                  <ActivityIndicator size="small" color={colors.warningFg} />
                ) : (
                  <Text style={styles.clearFailedBtnWarning}>Limpiar</Text>
                )}
              </Pressable>
            </View>
            <View style={styles.attachmentsBox}>
              {failedMedia.map((entry, index) => {
                const Icon = attachmentIcon(entry.mimeType);
                return (
                  <View
                    key={entry.id}
                    style={[
                      styles.attachmentRow,
                      index !== failedMedia.length - 1 && styles.attachmentRowDivider,
                    ]}
                  >
                    <Icon size={16} color={colors.warningFg} strokeWidth={2.2} />
                    <View style={styles.attachmentInfo}>
                      <Text style={styles.attachmentFile} numberOfLines={1}>
                        {entry.originalFilename ?? entry.mimeType}
                      </Text>
                      <Text style={styles.attachmentMeta} numberOfLines={1}>
                        {entry.surveyId}
                      </Text>
                    </View>
                    <Text style={styles.attachmentSize}>{formatSize(entry.fileSizeBytes)}</Text>
                    <Pressable
                      style={styles.attachmentRetry}
                      onPress={() => handleRetryMedia(entry)}
                      disabled={!isOnline || Boolean(retryingMediaId)}
                      accessibilityLabel="Reintentar adjunto"
                    >
                      {retryingMediaId === entry.id ? (
                        <ActivityIndicator size="small" color={colors.warningFg} />
                      ) : (
                        <RefreshCw size={15} color={colors.warningFg} strokeWidth={2.4} />
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <DestructiveButton
          label="Limpiar historial sincronizado"
          icon={Trash2}
          onPress={handlePurge}
          loading={isPurging}
        />
        {purgeResult !== null ? (
          <Text style={styles.purgeResult}>
            {purgeResult === 0
              ? 'No hay registros para limpiar (menos de 30 días).'
              : `${purgeResult} registro${purgeResult !== 1 ? 's' : ''} eliminado${purgeResult !== 1 ? 's' : ''}.`}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function CounterCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "warning" | "danger";
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Los contadores se apagan a neutro en cero (spec 74, Fase 7) — un
  // contador en 0 no debe leerse como una alerta.
  const isZero = value === 0;
  const fg = isZero ? colors.textMuted : tone === "warning" ? colors.warningFg : colors.dangerFg;
  const bg = isZero ? colors.surface : tone === "warning" ? colors.warningBg : colors.dangerBg;
  const bd = isZero ? colors.border : tone === "warning" ? colors.warningFg : colors.dangerFg;

  return (
    <View style={[styles.counterCard, { backgroundColor: bg, borderColor: bd }]}>
      <Text style={[styles.counterValue, { color: fg }]}>{value}</Text>
      <Text style={[styles.counterLabel, { color: fg }]}>{label}</Text>
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
    },
    title: { fontSize: 19, fontFamily: Fonts.extraBold, color: colors.textPrimary, letterSpacing: -0.3 },
    content: { padding: 14, gap: 14 },

    statusCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 15,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusCardOffline: { backgroundColor: colors.dangerBg, borderColor: colors.dangerFg },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    dot: { width: 9, height: 9, borderRadius: 5 },
    statusLabel: { flex: 1, fontSize: 13.5, fontFamily: Fonts.extraBold },
    syncingDetail: { fontSize: 11.5, fontFamily: Fonts.regular, color: colors.brand, marginTop: 7 },
    lastSync: { fontSize: 11.5, fontFamily: Fonts.regular, color: colors.textMuted, marginTop: 7 },

    countersRow: { flexDirection: "row", gap: 9 },
    counterCard: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 10,
      alignItems: "center",
      borderWidth: 1,
    },
    counterValue: { fontSize: 26, fontFamily: Fonts.extraBold, lineHeight: 28, marginBottom: 6 },
    counterLabel: { fontSize: 10, fontFamily: Fonts.bold, textAlign: "center", lineHeight: 13 },

    syncButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      backgroundColor: colors.brand,
      borderRadius: 11,
      paddingVertical: 16,
    },
    syncButtonDisabled: { backgroundColor: colors.textMuted },
    syncButtonText: { fontSize: 15, fontFamily: Fonts.extraBold, color: colors.brandForeground },

    purgeResult: { fontSize: 12, fontFamily: Fonts.regular, color: colors.textMuted, textAlign: "center" },

    section: { gap: 10 },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    sectionTitleDanger: { flex: 1, fontSize: 11.5, fontFamily: Fonts.extraBold, color: colors.dangerFg, letterSpacing: 0.5 },
    sectionTitleWarning: { flex: 1, fontSize: 11.5, fontFamily: Fonts.extraBold, color: colors.warningFg, letterSpacing: 0.5 },
    clearFailedBtn: { fontSize: 11, fontFamily: Fonts.bold, color: colors.dangerFg, textDecorationLine: "underline" },
    clearFailedBtnWarning: { fontSize: 11, fontFamily: Fonts.bold, color: colors.warningFg, textDecorationLine: "underline" },
    failedCard: {
      backgroundColor: colors.dangerBg,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.dangerFg,
      overflow: "hidden",
    },
    failedCardBody: { padding: 13, paddingBottom: 9, gap: 4 },
    failedId: { fontSize: 13, fontFamily: Fonts.extraBold, color: colors.textPrimary },
    failedError: { fontSize: 12, fontFamily: Fonts.medium, color: colors.dangerFg, lineHeight: 17 },
    failedFooter: {
      flexDirection: "row",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: colors.dangerFg,
    },
    failedAttempts: { flex: 1, fontSize: 9.5, fontFamily: Fonts.regular, color: colors.textMuted, paddingHorizontal: 14 },
    retryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderLeftWidth: 1,
      borderLeftColor: colors.dangerFg,
    },
    retryBtnText: { fontSize: 12, fontFamily: Fonts.extraBold, color: colors.dangerFg },

    attachmentsBox: {
      borderWidth: 1,
      borderColor: colors.warningFg,
      borderRadius: 11,
      backgroundColor: colors.warningBg,
      overflow: "hidden",
    },
    attachmentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingVertical: 12,
      paddingHorizontal: 14,
      minHeight: 56,
    },
    attachmentRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.warningFg },
    attachmentInfo: { flex: 1, minWidth: 0 },
    attachmentFile: { fontSize: 12.5, fontFamily: Fonts.bold, color: colors.textPrimary },
    attachmentMeta: { fontSize: 10.5, fontFamily: Fonts.regular, color: colors.textMuted, marginTop: 2 },
    attachmentSize: { fontSize: 10.5, fontFamily: Fonts.bold, color: colors.warningFg },
    attachmentRetry: { padding: 4 },

    allGood: {
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.successFg,
      borderRadius: 12,
      backgroundColor: colors.successBg,
      paddingVertical: 30,
      paddingHorizontal: 20,
      gap: 6,
    },
    allGoodText: { fontSize: 15, fontFamily: Fonts.extraBold, color: colors.successFg },
    allGoodDesc: { fontSize: 12, fontFamily: Fonts.regular, color: colors.successFg, opacity: 0.85 },
  });
}
