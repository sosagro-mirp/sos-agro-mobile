import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
      Alert.alert('Error', message);
    } finally {
      setRetryingMediaId(null);
    }
  };

  const isBusy = isSyncing || Boolean(currentlySyncingId);
  const statusColor = isOnline ? colors.successFg : colors.dangerFg;
  const statusLabel = isOnline ? "En línea" : "Sin conexión";

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Sincronización</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusLabel, { color: statusColor }]}>
              {statusLabel}
            </Text>
            {isBusy ? (
              <ActivityIndicator size="small" color={colors.brand} style={{ marginLeft: 8 }} />
            ) : null}
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
          <CounterCard label="Pendientes" value={pendingCount} color={colors.warningFg} />
          <CounterCard label="Con error" value={failedEntries.length} color={colors.dangerFg} />
          <CounterCard label="Adjuntos" value={failedMedia.length} color={colors.dangerFg} />
        </View>

        <Pressable
          style={[styles.syncButton, (!isOnline || isBusy) && styles.syncButtonDisabled]}
          onPress={handleSyncNow}
          disabled={!isOnline || isBusy}
        >
          {isBusy ? (
            <ActivityIndicator color={colors.brandForeground} />
          ) : (
            <Text style={styles.syncButtonText}>Sincronizar ahora</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.purgeButton, isPurging && styles.syncButtonDisabled]}
          onPress={handlePurge}
          disabled={isPurging}
        >
          {isPurging ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <Text style={styles.purgeButtonText}>Limpiar historial sincronizado</Text>
          )}
        </Pressable>
        {purgeResult !== null ? (
          <Text style={styles.purgeResult}>
            {purgeResult === 0
              ? 'No hay registros para limpiar (menos de 30 días).'
              : `${purgeResult} registro${purgeResult !== 1 ? 's' : ''} eliminado${purgeResult !== 1 ? 's' : ''}.`}
          </Text>
        ) : null}

        {failedEntries.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Errores de validación</Text>
              <Pressable onPress={handleClearFailed} disabled={isClearingFailed}>
                {isClearingFailed ? (
                  <ActivityIndicator size="small" color={colors.dangerFg} />
                ) : (
                  <Text style={styles.clearFailedBtn}>Limpiar todo</Text>
                )}
              </Pressable>
            </View>
            <Text style={styles.sectionHint}>
              Estos registros fueron rechazados por el servidor. Revisa el error
              y toca &quot;Reintentar&quot; si crees que el problema fue temporal.
            </Text>
            {failedEntries.map((entry) => (
              <View key={entry.id} style={styles.failedCard}>
                <Text style={styles.failedId} numberOfLines={1}>
                  Survey: {entry.surveyId}
                </Text>
                {entry.errorDetail ? (
                  <Text style={styles.failedError}>{entry.errorDetail}</Text>
                ) : null}
                <View style={styles.failedFooter}>
                  <Text style={styles.failedAttempts}>
                    {entry.attempts} intento{entry.attempts !== 1 ? "s" : ""}
                  </Text>
                  <Pressable
                    style={[
                      styles.retryBtn,
                      (!isOnline || Boolean(retryingId)) && styles.retryBtnDisabled,
                    ]}
                    onPress={() => handleRetry(entry)}
                    disabled={!isOnline || Boolean(retryingId)}
                  >
                    {retryingId === entry.id ? (
                      <ActivityIndicator size="small" color={colors.brandForeground} />
                    ) : (
                      <Text style={styles.retryBtnText}>Reintentar</Text>
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
              <Text style={styles.sectionTitle}>Adjuntos sin subir</Text>
              <Pressable onPress={handleClearFailedMedia} disabled={isClearingFailedMedia}>
                {isClearingFailedMedia ? (
                  <ActivityIndicator size="small" color={colors.dangerFg} />
                ) : (
                  <Text style={styles.clearFailedBtn}>Limpiar todo</Text>
                )}
              </Pressable>
            </View>
            <Text style={styles.sectionHint}>
              Estas fotos o audios no se pudieron subir; la respuesta de texto
              ya está sincronizada, pero el adjunto se perdería si no lo
              reintentas.
            </Text>
            {failedMedia.map((entry) => (
              <View key={entry.id} style={styles.failedCard}>
                <Text style={styles.failedId} numberOfLines={1}>
                  Survey: {entry.surveyId} · {entry.originalFilename ?? entry.mimeType}
                </Text>
                {entry.errorDetail ? (
                  <Text style={styles.failedError}>{entry.errorDetail}</Text>
                ) : null}
                <View style={styles.failedFooter}>
                  <Text style={styles.failedAttempts}>
                    {entry.attempts} intento{entry.attempts !== 1 ? "s" : ""}
                  </Text>
                  <Pressable
                    style={[
                      styles.retryBtn,
                      (!isOnline || Boolean(retryingMediaId)) && styles.retryBtnDisabled,
                    ]}
                    onPress={() => handleRetryMedia(entry)}
                    disabled={!isOnline || Boolean(retryingMediaId)}
                  >
                    {retryingMediaId === entry.id ? (
                      <ActivityIndicator size="small" color={colors.brandForeground} />
                    ) : (
                      <Text style={styles.retryBtnText}>Reintentar</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {pendingCount === 0 && failedEntries.length === 0 && failedMedia.length === 0 ? (
          <View style={styles.allGood}>
            <Text style={styles.allGoodIcon}>✓</Text>
            <Text style={styles.allGoodText}>Todo sincronizado</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function CounterCard({ label, value, color }: { label: string; value: number; color: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.counterCard}>
      <Text style={[styles.counterValue, { color }]}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
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
    title: { fontSize: 17, fontFamily: Fonts.bold, color: colors.textPrimary },
    content: { padding: 20, gap: 16 },

    statusCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    statusLabel: { fontSize: 16, fontFamily: Fonts.semiBold },
    syncingDetail: { fontSize: 13, fontFamily: Fonts.regular, color: colors.brand },
    lastSync: { fontSize: 13, fontFamily: Fonts.regular, color: colors.textMuted },

    countersRow: { flexDirection: "row", gap: 12 },
    counterCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    counterValue: { fontSize: 32, fontFamily: Fonts.bold },
    counterLabel: { fontSize: 13, fontFamily: Fonts.regular, color: colors.textMuted, marginTop: 2 },

    syncButton: {
      backgroundColor: colors.brand,
      borderRadius: 12,
      paddingVertical: 18,
      alignItems: "center",
    },
    syncButtonDisabled: { backgroundColor: colors.textMuted },
    syncButtonText: { fontSize: 17, fontFamily: Fonts.bold, color: colors.brandForeground },

    purgeButton: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    purgeButtonText: { fontSize: 15, fontFamily: Fonts.medium, color: colors.textPrimary },
    purgeResult: { fontSize: 13, fontFamily: Fonts.regular, color: colors.textMuted, textAlign: "center" },

    section: { gap: 10 },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    sectionTitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: colors.textPrimary },
    clearFailedBtn: { fontSize: 14, fontFamily: Fonts.semiBold, color: colors.dangerFg },
    sectionHint: { fontSize: 13, fontFamily: Fonts.regular, color: colors.textMuted, lineHeight: 18 },
    failedCard: {
      backgroundColor: colors.dangerBg,
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.dangerFg,
      gap: 6,
    },
    failedId: { fontSize: 13, fontFamily: Fonts.semiBold, color: colors.textPrimary },
    failedError: { fontSize: 12, fontFamily: Fonts.regular, color: colors.dangerFg, lineHeight: 18 },
    failedFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 4,
    },
    failedAttempts: { fontSize: 12, fontFamily: Fonts.regular, color: colors.textMuted },
    retryBtn: {
      backgroundColor: colors.brand,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 14,
    },
    retryBtnDisabled: { backgroundColor: colors.textMuted },
    retryBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: colors.brandForeground },

    allGood: { alignItems: "center", paddingVertical: 32, gap: 8 },
    allGoodIcon: { fontSize: 40, color: colors.brand },
    allGoodText: { fontSize: 16, fontFamily: Fonts.semiBold, color: colors.textPrimary },
  });
}
