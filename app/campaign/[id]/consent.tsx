import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ConsentForm, type ConsentFormValues } from "../../../src/components/campaign/ConsentForm";
import { OfflineBanner } from "../../../src/components/network/OfflineBanner";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { useTheme } from "../../../src/theme/ThemeProvider";
import { Fonts } from "../../../src/theme/fonts";
import type { ThemeColors } from "../../../src/theme/colors";
import type { ConsentDocument } from "../../../src/api/consents";
import { fetchActiveConsentDocument, submitConsent } from "../../../src/api/consents";
import { consentDocumentCacheStorage } from "../../../src/storage/consentDocumentCache";
import { consentRecordStore } from "../../../src/storage/consentRecordStore";
import { farmerCacheStorage } from "../../../src/storage/farmerCache";
import { generateLocalId } from "../../../src/lib/generateLocalId";
import { isLocalId } from "../../../src/lib/isLocalId";
import { syncQueueStorage } from "../../../src/storage/syncQueue";
import { buildConsentSyncPayload } from "../../../src/sync/consentSync";
import { logger } from "../../../src/lib/logger";

export default function ConsentScreen() {
  const { id, sessionId, farmerId, farmerName } = useLocalSearchParams<{
    id: string;
    sessionId: string;
    farmerId?: string;
    farmerName?: string;
  }>();
  const router = useRouter();
  const { isOnline } = useSyncStatusStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [document, setDocument] = useState<ConsentDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (isOnline) {
          const active = await fetchActiveConsentDocument();
          setDocument(active);
          // Refresca la caché para que la próxima vez offline tenga la última versión.
          consentDocumentCacheStorage.save(active).catch(() => {});
        } else {
          const cached = await consentDocumentCacheStorage.get();
          setDocument(cached);
        }
      } catch {
        // Sin red y sin caché previa: se queda en null, ConsentForm muestra el aviso.
        const cached = await consentDocumentCacheStorage.get().catch(() => null);
        setDocument(cached);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOnline]);

  async function handleSubmit(values: ConsentFormValues) {
    if (!document) return;
    setSubmitting(true);
    setError(null);
    const acceptedAt = new Date();

    // Hallazgo M1 (auditoría) — la rama a tomar no depende solo de `isOnline`
    // en el momento de aceptar: si la sesión se creó offline (`sessionId`
    // todavía provisional), el backend rechazaría el UUID inválido con 400
    // aunque haya vuelto la señal justo antes de este envío. Solo se toma la
    // rama online cuando el `sessionId` ya es real, sin importar el estado de
    // red actual — la resincronización de una sesión offline con red real la
    // resuelve `SyncQueueService`, no esta pantalla.
    const useOnlinePath = isOnline && !isLocalId(sessionId);

    try {
      if (useOnlinePath) {
        const response = await submitConsent({
          sessionId,
          consentDocumentId: document.consentDocumentId,
          respondentName: values.respondentName || undefined,
          acceptedDataProcessing: values.acceptedDataProcessing,
          acceptedPhoto: values.acceptedPhoto,
          acceptedAudio: values.acceptedAudio,
          acceptedVideo: values.acceptedVideo,
          acceptedFollowUpContact: values.acceptedFollowUpContact,
          acceptedAt: acceptedAt.toISOString(),
        });
        // Hallazgo M6 — sin esto, un consentimiento otorgado con red no deja
        // ningún rastro local: no aparece en la pestaña de sincronización ni
        // sirve de referencia si la app se reabre offline más tarde. Se marca
        // 'synced' directamente porque el backend ya lo confirmó.
        await consentRecordStore
          .save({
            id: response.consentRecordId,
            sessionId,
            consentDocumentId: document.consentDocumentId,
            respondentName: values.respondentName || undefined,
            acceptedDataProcessing: values.acceptedDataProcessing,
            acceptedPhoto: values.acceptedPhoto,
            acceptedAudio: values.acceptedAudio,
            acceptedVideo: values.acceptedVideo,
            acceptedFollowUpContact: values.acceptedFollowUpContact,
            acceptedAt,
            status: "synced",
            createdAt: acceptedAt,
          })
          .catch((err) => {
            logger.warn(`[consent] failed to save local record for online consent: ${String(err)}`);
          });
      } else {
        const localId = generateLocalId("consent");
        // Hallazgo M2 — reconstruir el payload a mano (en vez de reusar
        // buildConsentSyncPayload) fue lo que dejó esa función como código
        // muerto solo cubierto por su propio test; aquí es donde debía
        // llamarse.
        const payload = buildConsentSyncPayload({
          localId,
          sessionId,
          consentDocumentId: document.consentDocumentId,
          respondentName: values.respondentName || undefined,
          acceptedDataProcessing: values.acceptedDataProcessing,
          acceptedPhoto: values.acceptedPhoto,
          acceptedAudio: values.acceptedAudio,
          acceptedVideo: values.acceptedVideo,
          acceptedFollowUpContact: values.acceptedFollowUpContact,
          acceptedAt,
        });
        await consentRecordStore.save({
          id: localId,
          sessionId: payload.sessionId,
          consentDocumentId: payload.consentDocumentId,
          respondentName: payload.respondentName,
          acceptedDataProcessing: payload.acceptedDataProcessing,
          acceptedPhoto: payload.acceptedPhoto,
          acceptedAudio: payload.acceptedAudio,
          acceptedVideo: payload.acceptedVideo,
          acceptedFollowUpContact: payload.acceptedFollowUpContact,
          acceptedAt,
          status: "pending",
          createdAt: acceptedAt,
        });
        // Encolada antes que la primera respuesta de S1/S2: dequeueNextPending
        // es FIFO por createdAt, así que basta con crearla primero (ver
        // orderConsentBeforeSurveys para el criterio que esto satisface).
        await syncQueueStorage.enqueue({
          id: generateLocalId("consent"),
          surveyId: localId,
          campaignSessionId: sessionId,
          itemType: "consent",
        });
      }

      // Vigencia offline futura: si el encuestado ya tiene entrada en caché,
      // se anota la versión aceptada para que hasValidConsent() la reconozca
      // sin red en el próximo encuentro. Best-effort: nunca bloquea el flujo.
      if (farmerId) {
        farmerCacheStorage.recordConsent(farmerId, document.version, acceptedAt).then(
          (affected) => {
            if (affected === 0) {
              // M5 — esperado para un encuestado nuevo cuya identidad todavía
              // no está cacheada en este dispositivo; si el agricultor era
              // conocido, esto sí indica una fila perdida.
              logger.warn(`[consent] recordConsent affected 0 rows for farmerId=${farmerId}`);
            }
          },
          (err) => {
            logger.warn(`[consent] failed to record consent on farmerCache: ${String(err)}`);
          },
        );
      }

      router.replace(`/campaign/${id}/session/${sessionId}/orchestrator`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar el consentimiento");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <OfflineBanner />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={8}
        >
          <ChevronLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.titleWrapper}>
          <Text style={styles.title} numberOfLines={1}>
            Consentimiento informado
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ConsentForm
        document={document}
        loading={loading}
        submitting={submitting}
        error={error}
        defaultRespondentName={farmerName}
        onSubmit={handleSubmit}
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
    backBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    headerSpacer: { width: 48, flexShrink: 0 },
    titleWrapper: { flex: 1, minWidth: 0, alignItems: "center" },
    title: { fontSize: 13.5, fontFamily: Fonts.bold, color: colors.textPrimary, textAlign: "center" },
  });
}
