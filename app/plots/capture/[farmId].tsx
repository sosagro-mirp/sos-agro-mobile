import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import { Trash2 } from "lucide-react-native";
import { useFarmPlotCaptureStore } from "../../../src/store/useFarmPlotCaptureStore";
import { farmPlotStore } from "../../../src/storage/farmPlotStore";
import { syncQueueStorage } from "../../../src/storage/syncQueue";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { useSnackbar } from "../../../src/components/common/Snackbar";
import { ConfirmSheet } from "../../../src/components/common/ConfirmSheet";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";
import type { PolygonPoint } from "../../../src/api/farmPlots";

function localId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const MIN_POINTS = 3;

export default function CapturePlotScreen() {
  const { farmId, farmName } = useLocalSearchParams<{ farmId: string; farmName?: string }>();
  const router = useRouter();
  const { isOnline } = useSyncStatusStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show: showSnackbar } = useSnackbar();

  const { points, startCapture, addPoint, removeLastPoint, reset } = useFarmPlotCaptureStore();

  const [permissionStatus, setPermissionStatus] = useState<"unknown" | "granted" | "denied">("unknown");
  const [isAcquiring, setIsAcquiring] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [plotName, setPlotName] = useState("");
  const [plotDescription, setPlotDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);

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
      showSnackbar({
        message: "No se pudo obtener la ubicación. Asegúrate de tener señal GPS y vuelve a intentarlo.",
        variant: "error",
      });
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
        // Refleja el estado real de conectividad al momento de la captura,
        // no un valor fijo — el backend lo usa para distinguir lotes
        // capturados en campo sin señal de los capturados con conexión.
        capturedOffline: !isOnline,
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
      showSnackbar({ message: "No se pudo guardar el lote. Intenta de nuevo.", variant: "error" });
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
              setDiscardConfirmVisible(true);
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
              <ActivityIndicator size="small" color={colors.brandForeground} />
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
              placeholderTextColor={colors.textMuted}
              value={plotName}
              onChangeText={setPlotName}
              autoFocus
            />

            <Text style={styles.modalLabel}>Descripción (opcional)</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputMultiline]}
              placeholder="Cultivo, observaciones..."
              placeholderTextColor={colors.textMuted}
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
                  <ActivityIndicator size="small" color={colors.brandForeground} />
                ) : (
                  <Text style={styles.modalSaveText}>Guardar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmSheet
        visible={discardConfirmVisible}
        icon={Trash2}
        tone="danger"
        title="¿Descartar puntos?"
        body="Si vuelves atrás perderás los puntos capturados."
        secondaryAction={{ label: "Cancelar", onPress: () => setDiscardConfirmVisible(false) }}
        destructiveAction={{
          label: "Descartar",
          icon: Trash2,
          onPress: () => {
            setDiscardConfirmVisible(false);
            reset();
            router.back();
          },
        }}
        onRequestClose={() => setDiscardConfirmVisible(false)}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { width: 60 },
    backText: { fontSize: 14, fontFamily: Fonts.medium, color: colors.brand },
    title: { flex: 1, fontSize: 16, fontFamily: Fonts.bold, color: colors.textPrimary, textAlign: "center" },

    countBanner: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderBottomWidth: 1,
    },
    countBannerWarning: { backgroundColor: colors.warningBg, borderBottomColor: colors.warningFg },
    countBannerReady: { backgroundColor: colors.successBg, borderBottomColor: colors.successFg },
    countText: { fontSize: 13, fontFamily: Fonts.medium, color: colors.textPrimary, textAlign: "center" },

    list: { padding: 16, gap: 8, paddingBottom: 160 },
    empty: { paddingVertical: 40, alignItems: "center" },
    emptyText: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      textAlign: "center",
      paddingHorizontal: 20,
    },

    pointRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    pointIndex: {
      width: 28,
      fontSize: 14,
      fontFamily: Fonts.bold,
      color: colors.brand,
      textAlign: "center",
    },
    pointCoords: { flex: 1, gap: 2 },
    coordText: { fontSize: 13, fontFamily: Fonts.regular, color: colors.textPrimary },
    accuracyText: { fontSize: 11, fontFamily: Fonts.regular, color: colors.textMuted },

    footer: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      gap: 10,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    footerRow: { flexDirection: "row", gap: 10 },
    addBtn: {
      flex: 1,
      backgroundColor: colors.brand,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
    },
    addBtnDisabled: { backgroundColor: colors.textMuted },
    addBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: colors.brandForeground },
    removeBtn: {
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 14,
      alignItems: "center",
      backgroundColor: colors.dangerBg,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    removeBtnText: { fontSize: 14, fontFamily: Fonts.medium, color: colors.dangerFg },
    closeBtn: {
      backgroundColor: colors.infoFg,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
    },
    closeBtnDisabled: { backgroundColor: colors.textMuted },
    closeBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: colors.brandForeground },

    permissionDenied: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 16 },
    permissionTitle: { fontSize: 18, fontFamily: Fonts.bold, color: colors.textPrimary, textAlign: "center" },
    permissionDesc: { fontSize: 14, fontFamily: Fonts.regular, color: colors.textMuted, textAlign: "center", lineHeight: 22 },
    retryBtn: {
      backgroundColor: colors.brand,
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 24,
      marginTop: 8,
    },
    retryBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: colors.brandForeground },

    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 24,
      gap: 12,
    },
    modalTitle: { fontSize: 18, fontFamily: Fonts.bold, color: colors.textPrimary },
    modalLabel: { fontSize: 13, fontFamily: Fonts.medium, color: colors.textPrimary, marginTop: 4 },
    modalInput: {
      height: 48,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      fontFamily: Fonts.regular,
      fontSize: 15,
      color: colors.textPrimary,
    },
    modalInputMultiline: {
      height: 80,
      paddingTop: 12,
      textAlignVertical: "top",
    },
    modalMeta: { fontSize: 12, fontFamily: Fonts.regular, color: colors.textMuted },
    modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
    modalCancel: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    modalCancelText: { fontSize: 15, fontFamily: Fonts.medium, color: colors.textMuted },
    modalSave: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: colors.brand,
      alignItems: "center",
    },
    modalSaveDisabled: { backgroundColor: colors.textMuted },
    modalSaveText: { fontSize: 15, fontFamily: Fonts.semiBold, color: colors.brandForeground },
  });
}
