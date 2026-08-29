import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import { logger, type LogFile } from "../../src/lib/logger";
import { farmerCacheStorage, type FarmerCacheEntry } from "../../src/storage/farmerCache";
import { Fonts } from "../../src/theme/fonts";

const LOG_DIR = (FileSystem.documentDirectory ?? "") + "logs/";

interface LogFileMeta {
  date: string;
  sizeKb: number;
}

/**
 * Tamaño en bytes UTF-8 de un string, sin `Blob`/`TextEncoder` — su
 * disponibilidad en Hermes no está garantizada en RN 0.81 (mismo motivo por
 * el que la Fase 4 del spec 76 descartó la API `FileHandle`). Solo se usa
 * para un dato informativo de tamaño en esta pantalla de diagnóstico.
 */
function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.codePointAt(i)!;
    if (code > 0xffff) i += 1; // par sustituto: ya se contó como 1 code point
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export default function DevLogsScreen() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogFile[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearingFarmers, setClearingFarmers] = useState(false);
  const [farmerClearResult, setFarmerClearResult] = useState<string | null>(null);
  const [loadingFarmers, setLoadingFarmers] = useState(false);
  const [farmerCache, setFarmerCache] = useState<FarmerCacheEntry[] | null>(null);

  // Bug encontrado en la ronda manual del spec 76 (TC-076-08, 2026-08-29): esta
  // pantalla leía `LOG_DIR` a mano y listaba **cada segmento** como una fila
  // ("2026-08-29.000", "2026-08-29.001", ...), en vez de un día por fila. La
  // Fase 4 del spec ya afirmaba (incorrectamente) que `getLogs()` cubría esto
  // — nunca se había actualizado esta pantalla al rediseño por segmentos.
  // `getLogs()` sí reagrupa por fecha; basta con usarlo aquí también.
  const files: LogFileMeta[] = [...logs]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((l) => ({ date: l.date, sizeKb: Math.ceil(utf8ByteLength(l.content) / 1024) }));

  async function loadFileList() {
    setLoading(true);
    try {
      setLogs(await logger.getLogs());
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadFileList();
    }, [])
  );

  function handleSelectFile(date: string) {
    const match = logs.find((l) => l.date === date);
    setSelectedLog(match ?? { date, content: "(log no encontrado)" });
  }

  async function handleExport() {
    const content = await logger.exportLogs();
    if (!content) return;
    Share.share({ message: content });
  }

  async function handleViewFarmers() {
    if (loadingFarmers) return;
    setLoadingFarmers(true);
    try {
      const entries = await farmerCacheStorage.listRecent(50);
      setFarmerCache(entries);
    } catch (e) {
      logger.error("[DevLogs] viewFarmers error", e);
    } finally {
      setLoadingFarmers(false);
    }
  }

  async function handleClearFarmers() {
    if (clearingFarmers) return;
    setClearingFarmers(true);
    setFarmerClearResult(null);
    try {
      const count = await farmerCacheStorage.clearAll();
      setFarmerClearResult(`${count} agricultor${count !== 1 ? 'es' : ''} eliminado${count !== 1 ? 's' : ''}`);
    } catch (e) {
      setFarmerClearResult('Error al limpiar');
      logger.error("[DevLogs] clearFarmers error", e);
    } finally {
      setClearingFarmers(false);
    }
  }

  async function handleClear() {
    try {
      const info = await FileSystem.getInfoAsync(LOG_DIR);
      if (!info.exists) return;
      const names = await FileSystem.readDirectoryAsync(LOG_DIR);
      await Promise.all(
        names.map((name) =>
          FileSystem.deleteAsync(LOG_DIR + name, { idempotent: true })
        )
      );
      setSelectedLog(null);
      await loadFileList();
    } catch (e) {
      logger.error("[DevLogs] clear error", e);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => (selectedLog ? setSelectedLog(null) : router.back())} style={styles.backButton}>
          <Text style={styles.backText}>{selectedLog ? "← Volver" : "← Atrás"}</Text>
        </Pressable>
        <Text style={styles.title}>Logs de desarrollo</Text>
      </View>

      {/* Body */}
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} />
      ) : selectedLog ? (
        <ScrollView style={styles.logScroll} contentContainerStyle={styles.logContent}>
          <Text style={styles.logText}>{selectedLog.content}</Text>
        </ScrollView>
      ) : (
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
          {files.length === 0 ? (
            <Text style={styles.emptyText}>No hay archivos de log.</Text>
          ) : (
            files.map((f) => (
              <Pressable
                key={f.date}
                style={({ pressed }) => [styles.fileRow, pressed && styles.fileRowPressed]}
                onPress={() => handleSelectFile(f.date)}
              >
                <Text style={styles.fileDate}>{f.date}</Text>
                <Text style={styles.fileSize}>{f.sizeKb} KB</Text>
              </Pressable>
            ))
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <View style={styles.actionsRow}>
              <Pressable style={styles.actionButton} onPress={handleExport}>
                <Text style={styles.actionText}>Exportar todo</Text>
              </Pressable>
              <Pressable style={[styles.actionButton, styles.clearButton]} onPress={handleClear}>
                <Text style={[styles.actionText, styles.clearText]}>Limpiar logs</Text>
              </Pressable>
            </View>
            <Pressable
              style={[styles.actionButton, loadingFarmers && styles.buttonDisabled]}
              onPress={handleViewFarmers}
              disabled={loadingFarmers}
            >
              {loadingFarmers
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.actionText}>Ver caché de agricultores</Text>
              }
            </Pressable>
            {farmerCache ? (
              <View style={styles.farmerCacheBox}>
                <Text style={styles.devResult}>
                  {farmerCache.length} entrada{farmerCache.length !== 1 ? "s" : ""}
                </Text>
                {farmerCache.map((f) => (
                  <View key={f.farmerId} style={styles.farmerRow}>
                    <Text style={styles.farmerRowText}>
                      farmerId: {f.farmerId}{"\n"}
                      documentId: {f.documentId ?? "(sin documento)"}{"\n"}
                      name: {f.name}{"\n"}
                      phone: {f.phone ?? "-"} · farmName: {f.farmName ?? "-"} · crops: {f.crops?.length ?? 0}{"\n"}
                      cachedAt: {f.cachedAt.toISOString()}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Pressable
              style={[styles.actionButton, styles.clearButton, clearingFarmers && styles.buttonDisabled]}
              onPress={handleClearFarmers}
              disabled={clearingFarmers}
            >
              {clearingFarmers
                ? <ActivityIndicator color="#FECACA" size="small" />
                : <Text style={[styles.actionText, styles.clearText]}>Limpiar caché de agricultores</Text>
              }
            </Pressable>
            {farmerClearResult ? (
              <Text style={styles.devResult}>{farmerClearResult}</Text>
            ) : null}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    gap: 12,
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  backText: {
    color: "#94A3B8",
    fontFamily: Fonts.regular,
    fontSize: 14,
  },
  title: {
    color: "#F1F5F9",
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
  listScroll: {
    flex: 1,
  },
  fileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  fileRowPressed: {
    backgroundColor: "#1E293B",
  },
  fileDate: {
    color: "#E2E8F0",
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  fileSize: {
    color: "#64748B",
    fontFamily: Fonts.regular,
    fontSize: 13,
  },
  emptyText: {
    color: "#64748B",
    fontFamily: Fonts.regular,
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
  logScroll: {
    flex: 1,
  },
  logContent: {
    padding: 16,
  },
  logText: {
    color: "#94A3B8",
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 18,
  },
  listContent: {
    flexGrow: 1,
  },
  actions: {
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    marginTop: 8,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#1B6B3A",
    alignItems: "center",
  },
  clearButton: {
    backgroundColor: "#7F1D1D",
  },
  actionText: {
    color: "#fff",
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
  clearText: {
    color: "#FECACA",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  devResult: {
    color: "#94A3B8",
    fontFamily: Fonts.regular,
    fontSize: 13,
    textAlign: "center",
  },
  farmerCacheBox: {
    gap: 8,
  },
  farmerRow: {
    backgroundColor: "#1E293B",
    borderRadius: 8,
    padding: 10,
  },
  farmerRowText: {
    color: "#E2E8F0",
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
  },
});
