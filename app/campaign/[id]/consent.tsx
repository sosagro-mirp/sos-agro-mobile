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
import { fetchActiveConsentDocument } from "../../../src/api/consents";
import { consentDocumentCacheStorage } from "../../../src/storage/consentDocumentCache";
import { useSubmitConsent } from "../../../src/hooks/useSubmitConsent";

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
  const { submitting, error, submit } = useSubmitConsent({ sessionId, farmerId, document });

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

  // Cambio de alcance (2026-08-28, spec 78, Fase 14) — la lógica online/
  // offline vive ahora en `useSubmitConsent` (compartida con `ConsentModal`).
  // Esta pantalla se conserva como fallback de accesibilidad; su único rol
  // propio es navegar al orquestador tras un envío exitoso.
  async function handleSubmit(values: ConsentFormValues) {
    const ok = await submit(values);
    if (ok) router.replace(`/campaign/${id}/session/${sessionId}/orchestrator`);
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
