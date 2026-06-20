import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { syncQueueStorage, type SyncQueueEntry } from "../../../src/storage/syncQueue";
import { surveyDraftStore } from "../../../src/storage/surveyDraftStore";
import { NetworkMonitor } from "../../../src/sync/NetworkMonitor";
import { Fonts } from "../../../src/theme/fonts";

const GREEN = "#1B6B3A";

export default function SyncScreen() {
  const {
    isOnline,
    pendingCount,
    lastSyncAt,
    currentlySyncingId,
    refreshPendingCount,
  } = useSyncStatusStore();

  const [failedEntries, setFailedEntries] = useState<SyncQueueEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [purgeResult, setPurgeResult] = useState<number | null>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [isClearingFailed, setIsClearingFailed] = useState(false);

  const refreshData = async () => {
    await refreshPendingCount();
    const failed = await syncQueueStorage.listFailed();
    setFailedEntries(failed);
  };

  useEffect(() => {
    refreshData().catch(console.error);
  }, []);

  useEffect(() => {
    if (lastSyncAt) {
      refreshData().catch(console.error);
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

  const isBusy = isSyncing || Boolean(currentlySyncingId);
  const statusColor = isOnline ? "#16A34A" : "#DC2626";
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
              <ActivityIndicator size="small" color={GREEN} style={{ marginLeft: 8 }} />
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
          <CounterCard label="Pendientes" value={pendingCount} color="#F59E0B" />
          <CounterCard label="Con error" value={failedEntries.length} color="#DC2626" />
        </View>

        <Pressable
          style={[styles.syncButton, (!isOnline || isBusy) && styles.syncButtonDisabled]}
          onPress={handleSyncNow}
          disabled={!isOnline || isBusy}
        >
          {isBusy ? (
            <ActivityIndicator color="#fff" />
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
            <ActivityIndicator color={GREEN} />
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
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Text style={styles.clearFailedBtn}>Limpiar todo</Text>
                )}
              </Pressable>
            </View>
            <Text style={styles.sectionHint}>
              Estos registros fueron rechazados por el servidor. Revisa el error
              y toca "Reintentar" si crees que el problema fue temporal.
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
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.retryBtnText}>Reintentar</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {pendingCount === 0 && failedEntries.length === 0 ? (
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
  return (
    <View style={styles.counterCard}>
      <Text style={[styles.counterValue, { color }]}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: { fontSize: 17, fontFamily: Fonts.bold, color: "#111827" },
  content: { padding: 20, gap: 16 },

  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 6,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 16, fontFamily: Fonts.semiBold },
  syncingDetail: { fontSize: 13, fontFamily: Fonts.regular, color: GREEN },
  lastSync: { fontSize: 13, fontFamily: Fonts.regular, color: "#9CA3AF" },

  countersRow: { flexDirection: "row", gap: 12 },
  counterCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  counterValue: { fontSize: 32, fontFamily: Fonts.bold },
  counterLabel: { fontSize: 13, fontFamily: Fonts.regular, color: "#6B7280", marginTop: 2 },

  syncButton: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
  },
  syncButtonDisabled: { backgroundColor: "#9CA3AF" },
  syncButtonText: { fontSize: 17, fontFamily: Fonts.bold, color: "#fff" },

  purgeButton: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  purgeButtonText: { fontSize: 15, fontFamily: Fonts.medium, color: "#374151" },
  purgeResult: { fontSize: 13, fontFamily: Fonts.regular, color: "#6B7280", textAlign: "center" },

  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: "#374151" },
  clearFailedBtn: { fontSize: 14, fontFamily: Fonts.semiBold, color: "#DC2626" },
  sectionHint: { fontSize: 13, fontFamily: Fonts.regular, color: "#9CA3AF", lineHeight: 18 },
  failedCard: {
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    gap: 6,
  },
  failedId: { fontSize: 13, fontFamily: Fonts.semiBold, color: "#374151" },
  failedError: { fontSize: 12, fontFamily: Fonts.regular, color: "#DC2626", lineHeight: 18 },
  failedFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  failedAttempts: { fontSize: 12, fontFamily: Fonts.regular, color: "#9CA3AF" },
  retryBtn: {
    backgroundColor: GREEN,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  retryBtnDisabled: { backgroundColor: "#9CA3AF" },
  retryBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: "#fff" },

  allGood: { alignItems: "center", paddingVertical: 32, gap: 8 },
  allGoodIcon: { fontSize: 40, color: GREEN },
  allGoodText: { fontSize: 16, fontFamily: Fonts.semiBold, color: "#374151" },
});
