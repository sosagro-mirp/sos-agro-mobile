import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { ConsentForm, type ConsentFormValues } from "../../src/components/consents/ConsentForm";
import { AppText } from "../../src/components/common/AppText";
import { OfflineBanner } from "../../src/components/network/OfflineBanner";
import { useCachedInstrumentsStore } from "../../src/store/useCachedInstrumentsStore";
import { useInstrumentSurveyStore } from "../../src/store/useInstrumentSurveyStore";
import { useSyncStatusStore } from "../../src/store/useSyncStatusStore";
import { consentDocumentCacheStorage } from "../../src/storage/consentDocumentCache";
import { surveyDraftStore } from "../../src/storage/surveyDraftStore";
import { fetchActiveConsentDocument, type ConsentDocument } from "../../src/api/consents";
import { saveAnchoredConsent } from "../../src/lib/saveAnchoredConsent";
import { beginSurvey } from "../../src/lib/beginSurvey";
import { resolveRegistrationFlowCode } from "../../src/lib/instrumentCodeAliases";
import { Fonts } from "../../src/theme/fonts";
import { useTheme } from "../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../src/theme/colors";

// Spec 103 (DM7, C9) — registro de un productor nuevo, con o sin conexión:
// consentimiento → S_REG → cierre local (id provisional) → ficha. El
// consentimiento se guarda al cerrar el registro, anclado al S_REG.
export default function NuevoProductorScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isOnline } = useSyncStatusStore();
  const [document, setDocument] = useState<ConsentDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await useCachedInstrumentsStore.getState().loadFromCache();
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
  }, [isOnline]);

  const startRegistration = async (consent: ConsentFormValues) => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const instrument = useCachedInstrumentsStore
        .getState()
        .instruments.find((i) => resolveRegistrationFlowCode(i.code) === "REG");
      if (!instrument) {
        setError("El instrumento de Registro no está descargado. Toca «Actualizar» en Productores con conexión.");
        return;
      }
      // Sin sesión de campaña ni productor: la identidad sale del propio S_REG.
      const surveyId = await beginSurvey({ instrumentId: instrument.instrumentId });
      // La constancia se guarda ya (anclada al S_REG) para no perderla si la app se
      // cierra a mitad del registro; se encola al cerrar el registro (completed.tsx).
      if (document) {
        try {
          await saveAnchoredConsent({ values: consent, document, surveyId, enqueue: false });
        } catch (err) {
          // Sin constancia no se abre el registro: se descarta el S_REG recién creado
          // para no dejar un alta sin consentimiento (auditoría 80).
          await surveyDraftStore.deleteDraft(surveyId).catch(() => {});
          throw err;
        }
      }
      const store = useInstrumentSurveyStore.getState();
      store.initializeSurvey({
        surveyId,
        instrumentId: instrument.instrumentId,
        instrumentName: instrument.name,
        sections: instrument.sections,
      });
      useInstrumentSurveyStore.setState({ registro: { consent: null } });
      router.push(`/instrument/${instrument.instrumentId}/question/0`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar el registro");
    } finally {
      setStarting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <OfflineBanner />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Volver" style={styles.back}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <AppText style={styles.title} numberOfLines={1}>
          Productor nuevo
        </AppText>
        <View style={styles.back} />
      </View>
      <AppText style={styles.hint}>
        Primero el consentimiento del productor; luego el registro. Funciona sin conexión.
      </AppText>
      <ConsentForm
        document={document}
        loading={loading}
        submitting={starting}
        error={error}
        onSubmit={startRegistration}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    back: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
    title: { flex: 1, fontSize: 15, fontFamily: Fonts.bold, color: colors.textPrimary, textAlign: "center" },
    hint: { fontFamily: Fonts.regular, fontSize: 12.5, color: colors.textMuted, paddingHorizontal: 16, paddingVertical: 8 },
  });
}
