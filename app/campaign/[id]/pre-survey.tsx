import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, Pressable } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCachedCampaignsStore } from "../../../src/store/useCachedCampaignsStore";
import { useCampaignSessionStore } from "../../../src/store/useCampaignSessionStore";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { createCampaignSession } from "../../../src/api/campaignSessions";
import { useAuthStore } from "../../../src/store/useAuthStore";
import { PreSurveyForm } from "../../../src/components/campaign/PreSurveyForm";
import { OfflineBanner } from "../../../src/components/network/OfflineBanner";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";
import { generateLocalId } from "../../../src/lib/generateLocalId";
import { pendingSessionStorage } from "../../../src/storage/pendingSessions";
import { cacheFarmerIdentity } from "../../../src/lib/cacheFarmerIdentity";
import { farmerCacheStorage } from "../../../src/storage/farmerCache";
import { sessionCropsStorage } from "../../../src/storage/sessionCropsStorage";
import { NetworkError, ServerError } from "../../../src/api/httpClient";
import { NetworkMonitor } from "../../../src/sync/NetworkMonitor";
import { logger } from "../../../src/lib/logger";
import type { CropSummary, FarmerSearchResult } from "../../../src/types";
import { fetchFarmerConsentStatus } from "../../../src/api/consents";
import { consentDocumentCacheStorage } from "../../../src/storage/consentDocumentCache";
import { hasValidConsent } from "../../../src/lib/hasValidConsent";

/**
 * Spec 78 — decide si hay que pasar por la pantalla de consentimiento antes
 * del flujo de preguntas. Un encuestado nuevo siempre lo requiere; uno
 * conocido solo si su última constancia no está vigente para la versión
 * activa (online: lo resuelve el backend; offline: se evalúa contra lo
 * cacheado en este dispositivo — ver `hasValidConsent`).
 */
async function needsConsent(options: {
  isNew?: boolean;
  farmerId?: string;
  isOnline: boolean;
}): Promise<boolean> {
  if (options.isNew || !options.farmerId) return true;

  if (options.isOnline) {
    try {
      const status = await fetchFarmerConsentStatus(options.farmerId);
      return status.status !== "valid";
    } catch {
      return true;
    }
  }

  const [cachedFarmer, activeDocument] = await Promise.all([
    farmerCacheStorage.get(options.farmerId),
    consentDocumentCacheStorage.get(),
  ]);
  return !hasValidConsent(
    { consentVersion: cachedFarmer?.consentVersion, consentedAt: cachedFarmer?.consentedAt },
    activeDocument?.version ?? null,
  );
}

/**
 * Spec 81 — corrección de auditoría en ronda manual (TC-081-004,
 * 2026-08-30): el bloque de error de esta pantalla mostraba el mensaje
 * crudo de `NetworkError` ("Sin conexión a internet") sin importar si
 * realmente no había radio o si el backend específicamente no respondía —
 * el mismo problema que la Fase 4 corrigió en `PreSurveyForm` y el
 * orquestador, pero en un tercer lugar que ese trabajo no tocó. Sondea
 * `reachability` (bajo demanda, igual que los otros dos) antes de fijar el
 * texto.
 */
async function describeSessionError(err: unknown): Promise<string> {
  if (err instanceof NetworkError) {
    try {
      await NetworkMonitor.probeReachability();
    } catch (probeErr) {
      logger.error('[pre-survey] probeReachability failed', probeErr);
    }
    return useSyncStatusStore.getState().reachability === 'offline'
      ? "Sin conexión."
      : "No pudimos contactar el servidor.";
  }
  return err instanceof Error ? err.message : "Error al crear la sesión";
}

export default function PreSurveyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const campaign = useCachedCampaignsStore((s) => s.getById(id));
  const {
    startSession,
    applySessionResponse,
    applyOfflineSession,
    setSelectedFarmer,
    setNewFarmerMode,
    setConsentPending,
  } = useCampaignSessionStore();
  const { isOnline } = useSyncStatusStore();
  const { user } = useAuthStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!campaign) {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={styles.errorText}>Campaña no encontrada en caché.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const createOnlineSession = async (
    farmerId: string | undefined,
    crops: CropSummary[] | undefined,
    isNew?: boolean,
    farmerName?: string,
  ) => {
    const cropIds = crops?.map((c) => c.cropId);
    const sessionResponse = await createCampaignSession({
      campaignId: campaign.campaignId,
      userId: user?.userId,
      ...(farmerId ? { farmerId } : {}),
      ...(cropIds && cropIds.length > 0 ? { cropIds } : {}),
    });

    // Known crop for an existing farmer: seed it locally too so offline
    // navigation (getNextStepOffline) can unlock crop-conditioned steps
    // even if the device loses connection later in this same session.
    await sessionCropsStorage.save(sessionResponse.sessionId, crops ?? []);

    applySessionResponse(sessionResponse);
    await navigateAfterSessionCreated(sessionResponse.sessionId, { isNew, farmerId, farmerName });
  };

  // Cambio de alcance (2026-08-28, spec 78, Fase 14) — el consentimiento ya
  // no bloquea el paso al orquestador: `needsConsent()` sigue calculando lo
  // mismo (mismos criterios de antes), pero ahora solo alimenta
  // `consentPending` en el store, que el orquestador usa para mostrar el
  // aviso persistente y ofrecer `ConsentModal` en cualquier momento — la
  // navegación deja de depender de su resultado.
  const navigateAfterSessionCreated = async (
    sessionId: string,
    options: { isNew?: boolean; farmerId?: string; farmerName?: string },
  ) => {
    const mustConsent = await needsConsent({
      isNew: options.isNew,
      farmerId: options.farmerId,
      isOnline,
    }).catch(() => true);
    setConsentPending(mustConsent);

    router.push(`/campaign/${id}/session/${sessionId}/orchestrator`);
  };

  const startSessionOnline = async (options?: {
    farmerId?: string;
    farmerName?: string;
    isNew?: boolean;
    crops?: CropSummary[];
  }) => {
    setError(null);
    setIsLoading(true);
    startSession(campaign);

    if (options?.isNew) {
      setNewFarmerMode();
    } else if (options?.farmerId && options?.farmerName) {
      setSelectedFarmer(options.farmerId, options.farmerName);
    }

    try {
      await createOnlineSession(options?.farmerId, options?.crops, options?.isNew, options?.farmerName);
    } catch (err) {
      // The farmer was cached on this device (e.g. from a prior test round)
      // but has since been deleted on the backend: invalidate the stale
      // entry and continue the flow as a new farmer instead of leaving the
      // pollster stuck (see spec 49, Bug C).
      if (
        err instanceof ServerError &&
        err.status === 404 &&
        err.message === "Farmer not found" &&
        options?.farmerId
      ) {
        try {
          await farmerCacheStorage.remove(options.farmerId);
        } catch (removeErr) {
          // Best-effort invalidation: a cache failure here must not block
          // the retry below, which is what actually unblocks the pollster.
          logger.warn(
            `[pre-survey] failed to invalidate stale farmerCache entry ${options.farmerId}: ${
              removeErr instanceof Error ? removeErr.message : String(removeErr)
            }`,
          );
        }
        setNewFarmerMode();
        try {
          await createOnlineSession(undefined, options.crops, true);
          setError("El agricultor seleccionado ya no existe en el servidor. Se registró como agricultor nuevo.");
        } catch (retryErr) {
          setError(await describeSessionError(retryErr));
        }
      } else {
        setError(await describeSessionError(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const startSessionOffline = async (options?: {
    farmerId?: string;
    farmerName?: string;
    isNew?: boolean;
    crops?: CropSummary[];
  }) => {
    setError(null);
    setIsLoading(true);

    const localSessionId = generateLocalId('session');
    startSession(campaign);

    if (options?.isNew) {
      setNewFarmerMode();
    } else if (options?.farmerId && options?.farmerName) {
      setSelectedFarmer(options.farmerId, options.farmerName);
    }

    try {
      await pendingSessionStorage.create({
        localSessionId,
        campaignId: campaign.campaignId,
        farmerId: options?.farmerId,
        userId: user?.userId,
      });

      await sessionCropsStorage.save(localSessionId, options?.crops ?? []);

      applyOfflineSession(localSessionId);
      await navigateAfterSessionCreated(localSessionId, {
        isNew: options?.isNew,
        farmerId: options?.farmerId,
        farmerName: options?.farmerName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión offline");
    } finally {
      setIsLoading(false);
    }
  };

  const startSession_ = async (options?: {
    farmerId?: string;
    farmerName?: string;
    isNew?: boolean;
    crops?: CropSummary[];
  }) => {
    if (isOnline) {
      await startSessionOnline(options);
    } else {
      await startSessionOffline(options);
    }
  };

  const handleSearchSelect = async (farmerId: string, farmerName: string, farmer?: FarmerSearchResult) => {
    if (isOnline && farmer) {
      await cacheFarmerIdentity({
        farmerId: farmer.farmerId,
        name: farmer.name,
        documentId: farmer.documentId,
        phone: farmer.phone,
        farmName: farmer.farm?.name,
        crops: farmer.farm?.crops ?? undefined,
      });
    }
    await startSession_({ farmerId, farmerName, crops: farmer?.farm?.crops ?? undefined });
  };

  const handleNewFarmer = async () => {
    await startSession_({ isNew: true });
  };

  return (
    <SafeAreaView style={styles.root}>
      <OfflineBanner />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver a Campañas"
          hitSlop={8}
        >
          <ChevronLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.titleWrapper}>
          <Text style={styles.title} numberOfLines={1}>
            {campaign.name}
          </Text>
          <Text style={styles.titleSub} numberOfLines={1}>
            Identificar encuestado
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorBoxText}>{error}</Text>
        </View>
      ) : null}

      {/*
        Spec 81, Fase 1 — el formulario ya no se desmonta mientras carga: un
        fallo de red al crear la sesión (createCampaignSession/startSession)
        antes devolvía a un buscador vacío porque este ternario montaba una
        rama u otra. Ahora el overlay flota encima y la búsqueda/resultados
        del encuestador quedan intactos si `startSession_` falla.
      */}
      <PreSurveyForm
        isOnline={isOnline}
        onSearchSelect={handleSearchSelect}
        onNewFarmer={handleNewFarmer}
      />

      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Iniciando sesión…</Text>
        </View>
      ) : null}
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
    backBtn: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    // Usado solo en el estado "campaña no encontrada" (texto+ícono, distinto
    // del botón de volver del header normal, que quedó solo-ícono).
    back: { fontSize: 15, fontFamily: Fonts.regular, color: colors.brand },
    headerSpacer: { width: 48, flexShrink: 0 },
    titleWrapper: { flex: 1, minWidth: 0, alignItems: "center" },
    title: {
      fontSize: 13.5,
      fontFamily: Fonts.bold,
      color: colors.textPrimary,
      textAlign: "center",
    },
    titleSub: {
      fontSize: 10.5,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      marginTop: 2,
      textAlign: "center",
    },
    errorBox: {
      margin: 16,
      padding: 12,
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    errorBoxText: { fontSize: 14, fontFamily: Fonts.regular, color: colors.dangerFg },
    errorText: {
      fontSize: 16,
      fontFamily: Fonts.regular,
      color: colors.dangerFg,
      margin: 24,
    },
    loadingOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      backgroundColor: colors.surfaceMuted,
    },
    loadingText: {
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
    },
  });
}
