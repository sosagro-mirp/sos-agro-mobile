import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import {
  Trash2,
  Undo2,
  Plus,
  Check,
  ChevronLeft,
  LayoutGrid,
  Info,
  LoaderCircle,
} from "lucide-react-native";
import { useFarmPlotCaptureStore } from "../../../src/store/useFarmPlotCaptureStore";
import { farmPlotStore } from "../../../src/storage/farmPlotStore";
import { syncQueueStorage } from "../../../src/storage/syncQueue";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { useSnackbar } from "../../../src/components/common/Snackbar";
import { ConfirmSheet } from "../../../src/components/common/ConfirmSheet";
import { AppText } from "../../../src/components/common/AppText";
import { PlotSketch } from "../../../src/components/plots/PlotSketch";
import { polygonAreaHectares } from "../../../src/lib/polygonGeometry";
import { useBreakpoint } from "../../../src/lib/useBreakpoint";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";
import type { PolygonPoint } from "../../../src/api/farmPlots";

function localId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const MIN_POINTS = 3;

// Umbrales de precisión GPS para colorear cada vértice (spec 74, Fase 8 —
// el mockup pide "precisión coloreada por umbral" sin dar el número exacto;
// son bandas típicas de precisión de GPS de teléfono en campo abierto).
const ACCURACY_GOOD_M = 10;
const ACCURACY_OK_M = 25;

function accuracyTone(accuracy: number | null, colors: ThemeColors): string {
  if (accuracy == null) return colors.textMuted;
  if (accuracy <= ACCURACY_GOOD_M) return colors.successFg;
  if (accuracy <= ACCURACY_OK_M) return colors.warningFg;
  return colors.dangerFg;
}

export default function CapturePlotScreen() {
  const { farmId, farmName } = useLocalSearchParams<{ farmId: string; farmName?: string }>();
  const router = useRouter();
  const { isOnline } = useSyncStatusStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show: showSnackbar } = useSnackbar();
  const isTablet = useBreakpoint() === "tablet";

  const { points, startCapture, addPoint, removeLastPoint, reset } = useFarmPlotCaptureStore();

  const [permissionStatus, setPermissionStatus] = useState<"unknown" | "granted" | "denied">("unknown");
  const [isAcquiring, setIsAcquiring] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [plotName, setPlotName] = useState("");
  const [plotDescription, setPlotDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);

  const areaHectares = useMemo(() => polygonAreaHectares(points), [points]);
  const isReady = points.length >= MIN_POINTS;

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
          <TouchableOpacity onPress={() => router.back()} style={styles.headerSlot} accessibilityRole="button" accessibilityLabel="Volver">
            <ChevronLeft size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <AppText style={styles.headerTitle} numberOfLines={1}>Capturar lote</AppText>
          <View style={styles.headerSlot} />
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

  const sketchCard = (
    <View style={styles.sketchCard}>
      <View style={styles.sketchHeader}>
        <LayoutGrid size={15} color={colors.textMuted} strokeWidth={2.2} />
        <Text style={styles.sketchHeaderLabel}>CROQUIS DEL LOTE</Text>
        <Text style={styles.sketchHeaderArea}>
          {points.length >= 3 ? `aprox. ${areaHectares.toFixed(1)} ha` : ""}
        </Text>
      </View>
      <View style={isTablet ? styles.sketchBodyLarge : styles.sketchBody}>
        <PlotSketch points={points} size={isTablet ? "panel" : "capture"} />
      </View>
      <View style={styles.sketchFooter}>
        <Info size={13} color={colors.textMuted} strokeWidth={2.2} />
        <Text style={styles.sketchFooterText}>
          Dibujo a escala de los puntos capturados. No requiere conexión ni mapas.
        </Text>
      </View>
    </View>
  );

  const renderVertexRow = ({ item, index }: { item: PolygonPoint; index: number }) => (
    <View style={[styles.pointRow, index !== points.length - 1 && styles.pointRowDivider]}>
      <View style={styles.pointBadge}>
        <Text style={styles.pointBadgeText}>{index + 1}</Text>
      </View>
      <Text style={styles.coordText} numberOfLines={1}>
        {item.lat.toFixed(6)}, {item.lng.toFixed(6)}
      </Text>
      {item.accuracy != null ? (
        <Text style={[styles.accuracyText, { color: accuracyTone(item.accuracy, colors) }]}>
          ±{item.accuracy.toFixed(0)} m
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (points.length > 0) {
              setDiscardConfirmVisible(true);
            } else {
              router.back();
            }
          }}
          style={styles.headerSlot}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ChevronLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText style={styles.headerTitle} numberOfLines={1}>
          {farmName ? `Lote en ${farmName}` : "Capturar lote"}
        </AppText>
        <View style={styles.headerSlot} />
      </View>

      {/* Banda de conteo — ámbar bajo el mínimo, verde al llegar (spec 74, Fase 8) */}
      <View style={[styles.countBanner, isReady && styles.countBannerReady]}>
        {isReady ? (
          <Check size={17} color={colors.successFg} strokeWidth={2.6} />
        ) : null}
        <Text style={[styles.countText, isReady && styles.countTextReady]}>
          {points.length} punto{points.length !== 1 ? "s" : ""} capturado{points.length !== 1 ? "s" : ""}
          {isReady ? " — listo para cerrar" : ` — mínimo ${MIN_POINTS} para cerrar el polígono`}
        </Text>
      </View>

      {isTablet ? (
        // Lotes en dos paneles (spec 74, Fase 10): croquis grande a la
        // izquierda, lista de vértices a la derecha (310 px).
        <View style={styles.tabletRow}>
          <View style={styles.tabletSketchPanel}>
            {sketchCard}
          </View>
          <View style={styles.tabletVerticesPanel}>
            <Text style={styles.verticesLabel}>VÉRTICES</Text>
            <FlatList
              data={points}
              keyExtractor={(_, index) => String(index)}
              contentContainerStyle={styles.tabletVerticesList}
              renderItem={renderVertexRow}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  Toca &quot;Agregar punto&quot; para capturar el primer vértice del polígono.
                </Text>
              }
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={points}
          keyExtractor={(_, index) => String(index)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={sketchCard}
          ListEmptyComponent={null}
          renderItem={renderVertexRow}
          ListFooterComponent={points.length > 0 ? <Text style={styles.verticesLabel}>VÉRTICES</Text> : null}
          ListFooterComponentStyle={styles.verticesLabelWrapper}
        />
      )}
      {!isTablet && points.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Toca &quot;Agregar punto&quot; para capturar el primer vértice del polígono.
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Pressable
            style={[styles.addBtn, isAcquiring && styles.addBtnDisabled]}
            onPress={handleAddPoint}
            disabled={isAcquiring}
            accessibilityRole="button"
          >
            {isAcquiring ? (
              <LoaderCircle size={17} color={colors.textPrimary} />
            ) : (
              <>
                <Plus size={17} color={colors.textPrimary} strokeWidth={2.4} />
                <Text style={styles.addBtnText}>Agregar punto</Text>
              </>
            )}
          </Pressable>

          {points.length > 0 ? (
            <Pressable
              style={styles.removeBtn}
              onPress={removeLastPoint}
              accessibilityRole="button"
              accessibilityLabel="Quitar último punto"
            >
              <Undo2 size={18} color={colors.dangerFg} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={[styles.closeBtn, !isReady && styles.closeBtnDisabled]}
          onPress={() => setSaveModalVisible(true)}
          disabled={!isReady}
          accessibilityRole="button"
        >
          <Check size={18} color={colors.brandForeground} strokeWidth={2.6} />
          <Text style={styles.closeBtnText}>Cerrar polígono y guardar</Text>
        </Pressable>
      </View>

      {/* Bottom sheet de guardado — spec 74, Fase 8 */}
      <Modal
        visible={saveModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSaveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Guardar el lote</Text>
            <Text style={styles.modalMeta}>
              {points.length} punto{points.length !== 1 ? "s" : ""} · {areaHectares.toFixed(1)} ha ·{" "}
              {new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
            </Text>

            <Text style={styles.modalLabel}>NOMBRE DEL LOTE *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ej: Lote norte, Parcela 1..."
              placeholderTextColor={colors.textMuted}
              value={plotName}
              onChangeText={setPlotName}
              autoFocus
            />

            <Text style={styles.modalLabel}>DESCRIPCIÓN</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputMultiline]}
              placeholder="Cultivo, observaciones..."
              placeholderTextColor={colors.textMuted}
              value={plotDescription}
              onChangeText={setPlotDescription}
              multiline
              numberOfLines={3}
            />

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
                  <LoaderCircle size={17} color={colors.brandForeground} />
                ) : (
                  <Text style={styles.modalSaveText}>Guardar lote</Text>
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
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerSlot: { width: 48, height: 48, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    headerTitle: { flex: 1, fontSize: 13.5, fontFamily: Fonts.bold, color: colors.textPrimary, textAlign: "center" },

    countBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 11,
      backgroundColor: colors.warningBg,
      borderBottomWidth: 1,
      borderBottomColor: colors.warningFg,
    },
    countBannerReady: { backgroundColor: colors.successBg, borderBottomColor: colors.successFg },
    countText: { fontSize: 12.5, fontFamily: Fonts.bold, color: colors.warningFg, textAlign: "center" },
    countTextReady: { color: colors.successFg },

    list: { padding: 14, paddingBottom: 170 },

    // Lotes en dos paneles, tablet (spec 74, Fase 10): croquis grande a la
    // izquierda, lista de vértices a la derecha (310 px).
    tabletRow: { flex: 1, flexDirection: "row", padding: 14, paddingBottom: 170, gap: 14 },
    tabletSketchPanel: { flex: 1 },
    tabletVerticesPanel: { width: 310, flexShrink: 0 },
    tabletVerticesList: { paddingBottom: 8 },
    sketchBodyLarge: { minHeight: 320, alignItems: "center", justifyContent: "center", padding: 18 },

    sketchCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surfaceMuted,
      overflow: "hidden",
      marginBottom: 14,
    },
    sketchHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 13,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sketchHeaderLabel: { flex: 1, fontSize: 11, fontFamily: Fonts.extraBold, color: colors.textMuted, letterSpacing: 0.5 },
    sketchHeaderArea: { fontSize: 10.5, fontFamily: Fonts.bold, color: colors.textMuted },
    sketchBody: { height: 190, alignItems: "center", justifyContent: "center", padding: 14 },
    sketchFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    sketchFooterText: { flex: 1, fontSize: 10, fontFamily: Fonts.regular, color: colors.textMuted, lineHeight: 14 },

    verticesLabelWrapper: { marginTop: 4 },
    verticesLabel: { fontSize: 10.5, fontFamily: Fonts.extraBold, color: colors.textMuted, letterSpacing: 0.6, marginBottom: 9 },

    empty: { paddingVertical: 40, paddingHorizontal: 20, alignItems: "center" },
    emptyText: { fontSize: 13, fontFamily: Fonts.regular, color: colors.textMuted, textAlign: "center" },

    pointRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderTopLeftRadius: 11,
      borderTopRightRadius: 11,
      paddingHorizontal: 13,
      paddingVertical: 11,
    },
    pointRowDivider: { borderBottomWidth: 0 },
    pointBadge: {
      width: 24,
      height: 24,
      borderRadius: 99,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    pointBadgeText: { fontSize: 11, fontFamily: Fonts.extraBold, color: colors.brandForeground },
    coordText: { flex: 1, fontSize: 12, fontFamily: Fonts.medium, color: colors.textPrimary },
    accuracyText: { fontSize: 10.5, fontFamily: Fonts.bold },

    footer: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      padding: 14,
      gap: 10,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    footerRow: { flexDirection: "row", gap: 10 },
    addBtn: {
      flex: 1,
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 11,
      paddingVertical: 15,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minHeight: 48,
    },
    addBtnDisabled: { opacity: 0.6 },
    addBtnText: { fontSize: 13, fontFamily: Fonts.bold, color: colors.textPrimary },
    removeBtn: {
      width: 56,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.dangerBg,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    closeBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      backgroundColor: colors.brand,
      borderRadius: 11,
      paddingVertical: 17,
    },
    closeBtnDisabled: { backgroundColor: colors.textMuted },
    closeBtnText: { fontSize: 15, fontFamily: Fonts.extraBold, color: colors.brandForeground },

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
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 12,
      paddingHorizontal: 18,
      paddingBottom: 20,
      // Spec 74, Fase 10 — en tablet el overlay ocupa todo el ancho, pero la
      // tarjeta no: se centra con el mismo tope de 560 px de la columna de
      // lectura del instrumento, para que NOMBRE/DESCRIPCIÓN no se estiren.
      maxWidth: 560,
      width: "100%",
      alignSelf: "center",
      gap: 6,
    },
    modalHandle: {
      alignSelf: "center",
      width: 38,
      height: 4,
      borderRadius: 99,
      backgroundColor: colors.borderStrong,
      marginBottom: 12,
    },
    modalTitle: { fontSize: 17, fontFamily: Fonts.extraBold, color: colors.textPrimary },
    modalMeta: { fontSize: 11.5, fontFamily: Fonts.regular, color: colors.textMuted, marginBottom: 6 },
    modalLabel: { fontSize: 11, fontFamily: Fonts.bold, color: colors.textMuted, marginTop: 6, marginBottom: 6 },
    modalInput: {
      minHeight: 48,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontFamily: Fonts.regular,
      fontSize: 14,
      color: colors.textPrimary,
    },
    modalInputMultiline: {
      minHeight: 60,
      textAlignVertical: "top",
    },
    modalActions: { flexDirection: "row", gap: 10, marginTop: 12 },
    modalCancel: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: "center",
    },
    modalCancelText: { fontSize: 14, fontFamily: Fonts.bold, color: colors.textPrimary },
    modalSave: {
      flex: 1.4,
      paddingVertical: 16,
      borderRadius: 11,
      backgroundColor: colors.brand,
      alignItems: "center",
    },
    modalSaveDisabled: { backgroundColor: colors.textMuted },
    modalSaveText: { fontSize: 14.5, fontFamily: Fonts.extraBold, color: colors.brandForeground },
  });
}
