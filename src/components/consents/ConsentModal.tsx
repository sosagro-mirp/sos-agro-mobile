import { useEffect, useMemo, useState } from "react";
import { Modal, Platform, StyleSheet, Text, View, Pressable } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ConsentForm } from "./ConsentForm";
import { OfflineBanner } from "../network/OfflineBanner";
import { useSyncStatusStore } from "../../store/useSyncStatusStore";
import { useTheme } from "../../theme/ThemeProvider";
import { Fonts } from "../../theme/fonts";
import type { ThemeColors } from "../../theme/colors";
import type { ConsentDocument } from "../../api/consents";
import { fetchActiveConsentDocument } from "../../api/consents";
import { consentDocumentCacheStorage } from "../../storage/consentDocumentCache";
import { useSubmitConsent } from "../../hooks/useSubmitConsent";

interface ConsentModalProps {
  visible: boolean;
  sessionId: string;
  farmerId?: string;
  farmerName?: string;
  onAccepted: () => void;
  onClose: () => void;
}

/**
 * Cambio de alcance (2026-08-28, spec 78, Fase 15) — overlay que se monta
 * sobre `QuestionScreen` (el layout de preguntas) sin navegar, para el aviso
 * persistente de consentimiento pendiente. Reutiliza `ConsentForm` sin
 * cambios internos y `useSubmitConsent` (Fase 14) para la lógica online/
 * offline. `document` se resuelve igual que en `consent.tsx`: red si hay
 * conexión, caché si no — el modal nunca requiere red para abrirse, porque
 * el documento activo ya se descargó con la campaña (Fase 6).
 */
export function ConsentModal({
  visible,
  sessionId,
  farmerId,
  farmerName,
  onAccepted,
  onClose,
}: ConsentModalProps) {
  const { isOnline } = useSyncStatusStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [document, setDocument] = useState<ConsentDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const { submitting, error, submit } = useSubmitConsent({ sessionId, farmerId, document });

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        if (isOnline) {
          const active = await fetchActiveConsentDocument();
          if (!cancelled) setDocument(active);
          consentDocumentCacheStorage.save(active).catch(() => {});
        } else {
          const cached = await consentDocumentCacheStorage.get();
          if (!cancelled) setDocument(cached);
        }
      } catch {
        const cached = await consentDocumentCacheStorage.get().catch(() => null);
        if (!cancelled) setDocument(cached);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, isOnline]);

  async function handleSubmit(values: Parameters<typeof submit>[0]) {
    const ok = await submit(values);
    if (ok) onAccepted();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : undefined}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.root} edges={["top"]}>
        <OfflineBanner />
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
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
    </Modal>
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
