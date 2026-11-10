import { useEffect, useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ConsentForm, type ConsentFormValues } from "../consents/ConsentForm";
import { AppText } from "../common/AppText";
import { OfflineBanner } from "../network/OfflineBanner";
import { useSyncStatusStore } from "../../store/useSyncStatusStore";
import { useTheme } from "../../theme/ThemeProvider";
import { Fonts } from "../../theme/fonts";
import type { ThemeColors } from "../../theme/colors";
import { fetchActiveConsentDocument, type ConsentDocument } from "../../api/consents";
import { consentDocumentCacheStorage } from "../../storage/consentDocumentCache";
import { saveAnchoredConsent } from "../../lib/saveAnchoredConsent";

interface Props {
  visible: boolean;
  farmerId: string;
  farmerName?: string;
  onAccepted: () => void;
  onClose: () => void;
}

// Spec 103 (C10) — consentimiento desde la ficha, anclado al productor y sin
// sesión de campaña. El documento sale de la red o, sin ella, de la caché.
export function FarmerConsentModal({ visible, farmerId, farmerName, onAccepted, onClose }: Props) {
  const { isOnline } = useSyncStatusStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [document, setDocument] = useState<ConsentDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleSubmit(values: ConsentFormValues) {
    if (!document) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveAnchoredConsent({ values, document, farmerId });
      onAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar el consentimiento");
    } finally {
      setSubmitting(false);
    }
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
          <Pressable onPress={onClose} style={styles.back} accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={8}>
            <ChevronLeft size={20} color={colors.textPrimary} />
          </Pressable>
          <AppText style={styles.title} numberOfLines={1}>
            Consentimiento informado
          </AppText>
          <View style={styles.back} />
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
    header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    back: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
    title: { flex: 1, fontSize: 13.5, fontFamily: Fonts.bold, color: colors.textPrimary, textAlign: "center" },
  });
}
