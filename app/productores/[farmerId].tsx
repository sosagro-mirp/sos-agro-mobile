import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, RotateCcw, TriangleAlert } from "lucide-react-native";
import { coverageCacheStorage } from "../../src/storage/coverageCache";
import { farmerCacheStorage } from "../../src/storage/farmerCache";
import { consentDocumentCacheStorage } from "../../src/storage/consentDocumentCache";
import { useCachedInstrumentsStore } from "../../src/store/useCachedInstrumentsStore";
import { useCachedCampaignsStore } from "../../src/store/useCachedCampaignsStore";
import type { FarmerCoverageDetail } from "../../src/lib/coverageOverlay";
import { blockedNotice, listApplyTargets, reapplyConfirmationText, type ApplyTarget } from "../../src/lib/applyTargets";
import { applyContextParams } from "../../src/lib/surveyAnchor";
import { consentNoticeOffline } from "../../src/lib/consentAnchor";
import { summarizeProductorCoverage } from "../../src/lib/productorFilters";
import { AppText } from "../../src/components/common/AppText";
import { ConfirmSheet } from "../../src/components/common/ConfirmSheet";
import { FarmerConsentModal } from "../../src/components/productores/FarmerConsentModal";
import { CoverageUnitList } from "../../src/components/productores/CoverageUnitList";
import { SnapshotFreshnessBanner } from "../../src/components/productores/SnapshotFreshnessBanner";
import { Fonts } from "../../src/theme/fonts";
import { useTheme } from "../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../src/theme/colors";

const NOTICE_TEXT = {
  pending: "Este productor aún no tiene consentimiento registrado.",
  outdated: "El consentimiento del productor es de una versión anterior.",
  unknown: "No se conoce la versión vigente del consentimiento; actualiza con conexión.",
} as const;

export default function ProductorFichaScreen() {
  const params = useLocalSearchParams<{ farmerId: string }>();
  const farmerId = Array.isArray(params.farmerId) ? params.farmerId[0] : params.farmerId;
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const snapshotComputedAt = useCachedCampaignsStore((s) => s.snapshotComputedAt);

  const [detail, setDetail] = useState<FarmerCoverageDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<"none" | "pending" | "outdated" | "unknown">("none");
  const [reapply, setReapply] = useState<ApplyTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);

  const load = useCallback(async () => {
    if (!farmerId) return;
    // Los instrumentos viven en SQLite; el store de pantalla de inicio los necesita en memoria.
    await useCachedInstrumentsStore.getState().loadFromCache();
    const [d, farmer, doc] = await Promise.all([
      coverageCacheStorage.getDetail(farmerId),
      farmerCacheStorage.get(farmerId),
      consentDocumentCacheStorage.get(),
    ]);
    setDetail(d);
    setNotice(consentNoticeOffline(farmer, doc?.version ?? null));
    setLoaded(true);
  }, [farmerId]);

  // Al volver de una encuesta se recalcula: la superposición cambia al aplicar.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const targets = useMemo(() => (detail ? listApplyTargets(detail) : []), [detail]);

  const start = (t: ApplyTarget) => {
    if (!farmerId) return;
    const cached = useCachedInstrumentsStore.getState().instruments.some((i) => i.instrumentId === t.instrumentId);
    if (!cached) {
      setError("El instrumento no está descargado. Toca «Actualizar» en Productores con conexión.");
      return;
    }
    setError(null);
    router.push({
      pathname: "/instrument/[id]/start",
      params: {
        id: t.instrumentId,
        ...applyContextParams({
          farmerId,
          ...(t.farmId ? { farmId: t.farmId } : {}),
          ...(t.farmCropId ? { farmCropId: t.farmCropId } : {}),
          scopeLevel: t.scopeLevel,
        }),
      },
    });
  };

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Volver">
        <ChevronLeft size={22} color={colors.textPrimary} />
      </Pressable>
      <AppText style={styles.headerTitle} numberOfLines={1}>
        Productor
      </AppText>
    </View>
  );

  if (loaded && !detail) {
    return (
      <SafeAreaView style={styles.root}>
        {header}
        <View style={styles.pad}>
          <AppText style={styles.muted}>Este productor no está en la cobertura descargada. Actualiza con conexión.</AppText>
        </View>
      </SafeAreaView>
    );
  }

  const summary = detail ? summarizeProductorCoverage({ ...detail, statusByInstrument: {}, isProvisional: false }) : null;

  return (
    <SafeAreaView style={styles.root}>
      {header}
      <SnapshotFreshnessBanner computedAt={detail?.computedAt ?? snapshotComputedAt} />
      <ScrollView contentContainerStyle={styles.pad}>
        {detail ? (
          <>
            <AppText style={styles.name}>{detail.name}</AppText>
            <AppText style={styles.muted}>
              {detail.documentId ? `Doc. ${detail.documentId}` : "Sin documento"} · {summary?.label} aplicados
            </AppText>

            {notice !== "none" ? (
              <View style={styles.notice}>
                <TriangleAlert size={16} color={colors.warningFg} />
                <AppText style={styles.noticeText}>{NOTICE_TEXT[notice]} Puedes aplicar instrumentos igualmente.</AppText>
                {notice !== "unknown" ? (
                  <Pressable onPress={() => setConsentOpen(true)} accessibilityRole="button" accessibilityLabel="Registrar consentimiento">
                    <AppText style={styles.noticeAction}>Registrar</AppText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <AppText style={styles.section}>FINCAS</AppText>
            {detail.farms.length === 0 ? (
              <AppText style={styles.muted}>Sin fincas registradas.</AppText>
            ) : (
              detail.farms.map((f) => (
                <View key={f.farmId} style={styles.card}>
                  <AppText style={styles.cardTitle}>
                    {f.name}
                    {f.isPrimary ? " · principal" : ""}
                  </AppText>
                  <AppText style={styles.muted}>
                    {[f.role, f.town?.name].filter(Boolean).join(" · ") || "Sin rol ni municipio"}
                  </AppText>
                  {f.crops.length > 0 ? (
                    <AppText style={styles.muted}>Cultivos: {f.crops.map((c) => c.name).join(", ")}</AppText>
                  ) : null}
                </View>
              ))
            )}

            <AppText style={styles.section}>COBERTURA</AppText>
            {/* DM8 / C4: sin finca (o productor aún provisional) la foto no trae los
                instrumentos de finca ni de cultivo; se avisa por qué no hay acción. */}
            {detail.farms.length === 0 ? (
              <View style={styles.notice}>
                <TriangleAlert size={16} color={colors.warningFg} />
                <AppText style={styles.noticeText}>
                  {blockedNotice(detail.farmerId.startsWith("local_farmer_") ? "pendiente_sincronizar" : "sin_finca")}
                </AppText>
              </View>
            ) : null}
            {error ? <AppText style={styles.error}>{error}</AppText> : null}
            <CoverageUnitList targets={targets} onApply={start} onReapply={setReapply} />
          </>
        ) : (
          <AppText style={styles.muted}>Cargando…</AppText>
        )}
      </ScrollView>

      <FarmerConsentModal
        visible={consentOpen}
        farmerId={farmerId ?? ""}
        farmerName={detail?.name}
        onAccepted={() => {
          setConsentOpen(false);
          void load();
        }}
        onClose={() => setConsentOpen(false)}
      />
      <ConfirmSheet
        visible={!!reapply}
        icon={RotateCcw}
        tone="warning"
        title="Aplicar de nuevo"
        body={reapply ? reapplyConfirmationText(reapply) : ""}
        primaryAction={{
          label: "Aplicar de nuevo",
          onPress: () => {
            const t = reapply;
            setReapply(null);
            if (t) start(t);
          },
        }}
        secondaryAction={{ label: "Cancelar", onPress: () => setReapply(null) }}
        onRequestClose={() => setReapply(null)}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },
    header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
    headerTitle: { fontFamily: Fonts.bold, fontSize: 16, color: colors.textPrimary },
    pad: { padding: 16 },
    name: { fontFamily: Fonts.extraBold, fontSize: 20, color: colors.textPrimary },
    muted: { fontFamily: Fonts.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    section: { fontFamily: Fonts.extraBold, fontSize: 12, color: colors.textMuted, marginTop: 18, marginBottom: 8 },
    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8 },
    cardTitle: { fontFamily: Fonts.bold, fontSize: 14, color: colors.textPrimary },
    notice: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.warningBg, borderRadius: 10, padding: 10, marginTop: 12 },
    noticeAction: { fontFamily: Fonts.bold, fontSize: 12, color: colors.warningFg, textDecorationLine: "underline" },
    noticeText: { flex: 1, fontFamily: Fonts.medium, fontSize: 12, color: colors.warningFg },
    error: { fontFamily: Fonts.medium, fontSize: 12, color: colors.dangerFg, marginBottom: 8 },
  });
}
