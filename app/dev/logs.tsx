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
import { Fonts } from "../../src/theme/fonts";

const LOG_DIR = (FileSystem.documentDirectory ?? "") + "logs/";

interface LogFileMeta {
  date: string;
  sizeKb: number;
}

export default function DevLogsScreen() {
  const router = useRouter();
  const [files, setFiles] = useState<LogFileMeta[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogFile | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadFileList() {
    setLoading(true);
    try {
      const info = await FileSystem.getInfoAsync(LOG_DIR);
      if (!info.exists) {
        setFiles([]);
        return;
      }
      const names = await FileSystem.readDirectoryAsync(LOG_DIR);
      const metas: LogFileMeta[] = [];
      for (const name of names.sort().reverse()) {
        const fileInfo = await FileSystem.getInfoAsync(LOG_DIR + name);
        const sizeBytes = fileInfo.exists && 'size' in fileInfo ? (fileInfo.size ?? 0) : 0;
        metas.push({
          date: name.replace(".log", ""),
          sizeKb: Math.ceil(sizeBytes / 1024),
        });
      }
      setFiles(metas);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadFileList();
    }, [])
  );

  async function handleSelectFile(date: string) {
    const content = await FileSystem.readAsStringAsync(LOG_DIR + date + ".log", {
      encoding: FileSystem.EncodingType.UTF8,
    }).catch(() => "(error al leer archivo)");
    setSelectedLog({ date, content });
  }

  async function handleExport() {
    const content = await logger.exportLogs();
    if (!content) return;
    Share.share({ message: content });
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
      console.error("[DevLogs] clear error", e);
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
        <ScrollView style={styles.listScroll}>
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
        </ScrollView>
      )}

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <Pressable style={styles.actionButton} onPress={handleExport}>
          <Text style={styles.actionText}>Exportar todo</Text>
        </Pressable>
        <Pressable style={[styles.actionButton, styles.clearButton]} onPress={handleClear}>
          <Text style={[styles.actionText, styles.clearText]}>Limpiar logs</Text>
        </Pressable>
      </View>
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
  bottomBar: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
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
});
