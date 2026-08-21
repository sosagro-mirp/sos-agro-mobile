import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import { useFarmPlotCaptureStore } from "../../../../src/store/useFarmPlotCaptureStore";
import { farmPlotStore } from "../../../../src/storage/farmPlotStore";
import { syncQueueStorage } from "../../../../src/storage/syncQueue";
import { Fonts } from "../../../../src/theme/fonts";
import type { PolygonPoint } from "../../../../src/api/farmPlots";

function localId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const GREEN = "#1B6B3A";
const MIN_POINTS = 3;

export default function CapturePlotScreen() {
  const { farmId, farmName } = useLocalSearchParams<{ farmId: string; farmName?: string }>();
  const router = useRouter();

  const { points, startCapture, addPoint, removeLastPoint, reset } = useFarmPlotCaptureStore();

  const [permissionStatus, setPermissionStatus] = useState<"unknown" | "granted" | "denied">("unknown");
  const [isAcquiring, setIsAcquiring] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [plotName, setPlotName] = useState("");
  const [plotDescription, setPlotDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    startCapture(farmId, farmName ?? "");
    requestPermissions();
    return () => { reset(); };
  }, []);

  async function requestPermissions() {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === "granted") {
      setPermissionStatus("granted");
      return;
    }
    const { status: requested } = await Location.requestForegroundPermissionsAsync();
    setPermissionStatus(requested === "granted" ? "granted" : "denied");
  }

  async function handleAddPoint() {
    if (permissionStatus !== "granted") {
      await requestPermissions();
      return;
    }
    setIsAcquiring(true);
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 0,
      });
      const point: PolygonPoint = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        altitude: location.coords.altitude ?? null,
        accuracy: location.coords.accuracy ?? null,
        capturedAt: new Date().toISOString(),
      };
      addPoint(point);
    } catch {
      Alert.alert(
        "Error GPS",
        "No se pudo obtener la ubicación. Asegúrate de tener señal GPS y vuelve a intentarlo.",
      );
    } finally {
      setIsAcquiring(false);
    }
  }

  async function handleSave() {
    if (!plotName.trim()) return;
    setIsSaving(true);
    try {
      const now = new Date();
      const farmPlotId = localId();
      const polygon = {
        points,
        closedAt: now.toISOString(),
      };

      await farmPlotStore.saveDraft({
        id: farmPlotId,
        farmId,
        name: plotName.trim(),
        description: plotDescription.trim() || undefined,
        polygon,
        status: "draft",
        capturedOffline: true,
        createdAt: now,
        updatedAt: now,
      });

      await syncQueueStorage.enqueue({
        id: localId(),
        surveyId: farmPlotId,
        itemType: "farm-plot",
      });

      reset();
      router.back();
    } catch {
      Alert.alert("Error", "No se pudo guardar el lote. Intenta de nuevo.");
    } finally {
      setIsSaving(false);
      setSaveModalVisible(false);
    }
  }

  if (permissionStatus === "denied") {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Volver</Text>
          </Pressable>
          <Text style={styles.title}>Capturar lote</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.permissionDenied}>
          <Text style={styles.permissionTitle}>Permiso de ubicación requerido</Text>
          <Text style={styles.permissionDesc}>
            SOSAgro necesita acceso a tu ubicación para capturar los puntos del polígono. Ve a
            Ajustes del dispositivo {">"} Aplicaciones {">"} SOSAgro {">"} Permisos y activa
            &quot;Ubicación&quot;.
          </Text>
          <Pressable style={styles.retryBtn} onPress={requestPermissions}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (points.length > 0) {
              Alert.alert(
                "¿Descartar puntos?",
                "Si vuelves atrás perderás los puntos capturados.",
                [
                  { text: "Cancelar", style: "cancel" },
                  { text: "Descartar", style: "destructive", onPress: () => { reset(); router.back(); } },
                ],
              );
            } else {
              router.back();
            }
          }}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>← Volver</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {farmName ? `Lote en ${farmName}` : "Capturar lote"}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Point count banner */}
      <View style={[styles.countBanner, points.length >= MIN_POINTS ? styles.countBannerReady : styles.countBannerWarning]}>
        <Text style={styles.countText}>
          {points.length} punto{points.length !== 1 ? "s" : ""} capturado{points.length !== 1 ? "s" : ""}
          {points.length < MIN_POINTS
            ? ` — mínimo ${MIN_POINTS} para cerrar el polígono`
            : " — listo para cerrar"}
        </Text>
      </View>

      {/* Points list */}
      <FlatList
        data={points}
        keyExtractor={(_, index) => String(index)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              Toca &quot;Agregar punto GPS&quot; para capturar el primer vértice del polígono.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.pointRow}>
            <Text style={styles.pointIndex}>{index + 1}</Text>
            <View style={styles.pointCoords}>
              <Text style={styles.coordText}>
                {item.lat.toFixed(6)}, {item.lng.toFixed(6)}
              </Text>
              {item.accuracy != null ? (
                <Text style={styles.accuracyText}>±{item.accuracy.toFixed(0)} m</Text>
              ) : null}
            </View>
          </View>
        )}
      />

      {/* Actions */}
      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Pressable
            style={[styles.addBtn, isAcquiring && styles.addBtnDisabled]}
            onPress={handleAddPoint}
            disabled={isAcquiring}
            accessibilityRole="button"
          >
            {isAcquiring ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.addBtnText}>Agregar punto GPS</Text>
            )}
          </Pressable>

          {points.length > 0 ? (
            <Pressable style={styles.removeBtn} onPress={removeLastPoint} accessibilityRole="button">
              <Text style={styles.removeBtnText}>Quitar último</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={[styles.closeBtn, points.length < MIN_POINTS && styles.closeBtnDisabled]}
          onPress={() => setSaveModalVisible(true)}
          disabled={points.length < MIN_POINTS}
          accessibilityRole="button"
        >
          <Text style={styles.closeBtnText}>Cerrar polígono y guardar</Text>
        </Pressable>
      </View>

      {/* Save modal */}
      <Modal
        visible={saveModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSaveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Guardar lote</Text>

            <Text style={styles.modalLabel}>Nombre del lote *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ej: Lote norte, Parcela 1..."
              placeholderTextColor="#9CA3AF"
              value={plotName}
              onChangeText={setPlotName}
              autoFocus
            />

            <Text style={styles.modalLabel}>Descripción (opcional)</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputMultiline]}
              placeholder="Cultivo, observaciones..."
              placeholderTextColor="#9CA3AF"
              value={plotDescription}
              onChangeText={setPlotDescription}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.modalMeta}>
              {points.length} puntos · {new Date().toLocaleDateString("es-CO")}
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setSaveModalVisible(false)}
                disabled={isSaving}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSave, (!plotName.trim() || isSaving) && styles.modalSaveDisabled]}
                onPress={handleSave}
                disabled={!plotName.trim() || isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Guardar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backBtn: { width: 60 },
  backText: { fontSize: 14, fontFamily: Fonts.medium, color: GREEN },
  title: { flex: 1, fontSize: 16, fontFamily: Fonts.bold, color: "#111827", textAlign: "center" },

  countBanner: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  countBannerWarning: { backgroundColor: "#FEF3C7", borderBottomColor: "#FDE68A" },
  countBannerReady: { backgroundColor: "#DCFCE7", borderBottomColor: "#BBF7D0" },
  countText: { fontSize: 13, fontFamily: Fonts.medium, color: "#374151", textAlign: "center" },

  list: { padding: 16, gap: 8, paddingBottom: 160 },
  empty: { paddingVertical: 40, alignItems: "center" },
  emptyText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 20,
  },

  pointRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 12,
  },
  pointIndex: {
    width: 28,
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: GREEN,
    textAlign: "center",
  },
  pointCoords: { flex: 1, gap: 2 },
  coordText: { fontSize: 13, fontFamily: Fonts.regular, color: "#111827" },
  accuracyText: { fontSize: 11, fontFamily: Fonts.regular, color: "#6B7280" },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    gap: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  footerRow: { flexDirection: "row", gap: 10 },
  addBtn: {
    flex: 1,
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  addBtnDisabled: { backgroundColor: "#9CA3AF" },
  addBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: "#fff" },
  removeBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  removeBtnText: { fontSize: 14, fontFamily: Fonts.medium, color: "#DC2626" },
  closeBtn: {
    backgroundColor: "#1E40AF",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  closeBtnDisabled: { backgroundColor: "#9CA3AF" },
  closeBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: "#fff" },

  permissionDenied: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 16 },
  permissionTitle: { fontSize: 18, fontFamily: Fonts.bold, color: "#111827", textAlign: "center" },
  permissionDesc: { fontSize: 14, fontFamily: Fonts.regular, color: "#6B7280", textAlign: "center", lineHeight: 22 },
  retryBtn: {
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  retryBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: "#fff" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontFamily: Fonts.bold, color: "#111827" },
  modalLabel: { fontSize: 13, fontFamily: Fonts.medium, color: "#374151", marginTop: 4 },
  modalInput: {
    height: 48,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: "#111827",
  },
  modalInputMultiline: {
    height: 80,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  modalMeta: { fontSize: 12, fontFamily: Fonts.regular, color: "#9CA3AF" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  modalCancelText: { fontSize: 15, fontFamily: Fonts.medium, color: "#6B7280" },
  modalSave: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: "center",
  },
  modalSaveDisabled: { backgroundColor: "#9CA3AF" },
  modalSaveText: { fontSize: 15, fontFamily: Fonts.semiBold, color: "#fff" },
});
