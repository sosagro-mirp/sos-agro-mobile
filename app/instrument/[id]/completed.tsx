import { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, type DimensionValue } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, ArrowRight, TriangleAlert } from "lucide-react-native";
import { useInstrumentSurveyStore } from "../../../src/store/useInstrumentSurveyStore";
import { useCampaignSessionStore } from "../../../src/store/useCampaignSessionStore";
import { completeRegistrationOffline, confirmLocalFarmer, type RegistrationCompletionOutcome } from "../../../src/lib/registrationCompletion";
import { enqueueConsent } from "../../../src/lib/saveAnchoredConsent";
import { consentRecordStore } from "../../../src/storage/consentRecordStore";
import { farmerCacheStorage } from "../../../src/storage/farmerCache";
import { consentDocumentCacheStorage } from "../../../src/storage/consentDocumentCache";
import { surveyDraftStore } from "../../../src/storage/surveyDraftStore";
import { DocumentCollisionModal } from "../../../src/components/farmers/DocumentCollisionModal";
import { leaveToFarmer } from "../../../src/lib/productorNavigation";
import { advanceWithinCampaign } from "../../../src/lib/campaignNavigation";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";

export default function InstrumentCompletedScreen() {
  const router = useRouter();
  const { instrumentName, campaignSessionId, surveyId, farmerId: ownFarmerId, legacyReturnFarmerId, registro, reset } =
    useInstrumentSurveyStore();
  // Spec 104: un borrador de campaña heredado reanudado por productor también vuelve a la ficha.
  const productorFarmerId = campaignSessionId ? legacyReturnFarmerId : ownFarmerId;
  // Spec 103 (DM7) — cierre del registro de un productor nuevo desde «Productores».
  const [collision, setCollision] = useState<Extract<RegistrationCompletionOutcome, { kind: 'collision' }> | null>(null);
  const [registroError, setRegistroError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const { campaign, currentStep, sessionId, farmerName, markStepCompleted, setLastCompletedSurveyId } =
    useCampaignSessionStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isInsideCampaign = Boolean(campaignSessionId && campaign && !legacyReturnFarmerId);
  const completedSteps = currentStep ? currentStep.completedCount + 1 : 0;
  const progressPercent = currentStep
    ? `${Math.round((completedSteps / currentStep.totalSteps) * 100)}%`
    : "0%";

  // Encola la constancia ya guardada al aceptar (anclada al S_REG) y abre la ficha.
  const goToFarmer = async (farmerId: string) => {
    if (surveyId) {
      try {
        const record = await consentRecordStore.getBySurveyId(surveyId);
        if (record && record.status === "pending") {
          await enqueueConsent(record.id);
          // La vigencia offline se marca solo con la versión del documento que se
          // aceptó; si la caché ya trae otro documento, la ficha vuelve a ofrecerlo.
          const document = await consentDocumentCacheStorage.get();
          if (document && document.consentDocumentId === record.consentDocumentId) {
            await farmerCacheStorage.recordConsent(farmerId, document.version, record.acceptedAt).catch(() => 0);
          }
        }
      } catch {
        // El consentimiento no bloquea el registro: la ficha lo vuelve a ofrecer.
      }
    }
    reset();
    router.dismissTo("/(tabs)/productores");
    router.push(`/productores/${farmerId}`);
  };

  const finishRegistration = async () => {
    if (!surveyId || finishing) return;
    setFinishing(true);
    setRegistroError(null);
    try {
      const outcome = await completeRegistrationOffline({ registroSurveyId: surveyId });
      if (outcome.kind === "collision") setCollision(outcome);
      else if (outcome.kind === "resolved") await goToFarmer(outcome.farmerId);
      else setRegistroError("No se pudo leer la identidad del productor. Revisa nombre y documento en Borradores.");
    } catch (err) {
      setRegistroError(err instanceof Error ? err.message : "Error al cerrar el registro");
    } finally {
      setFinishing(false);
    }
  };

  const resolveCollision = async (resolution: "same_person" | "separate_person") => {
    if (!collision || !surveyId) return;
    setFinishing(true);
    try {
      const draft = collision.localDraft;
      if (resolution === "separate_person") {
        const confirmed = await confirmLocalFarmer(draft, surveyId);
        setCollision(null);
        await goToFarmer(confirmed.farmerId);
      } else if (draft.collision?.existingFarmerId) {
        // Misma persona: el S_REG queda del productor ya conocido en este dispositivo.
        await surveyDraftStore.setFarmerId(surveyId, draft.collision.existingFarmerId);
        setCollision(null);
        await goToFarmer(draft.collision.existingFarmerId);
      }
    } catch (err) {
      setRegistroError(err instanceof Error ? err.message : "Error al resolver la colisión");
    } finally {
      setFinishing(false);
    }
  };

  const handleContinue = () => {
    if (registro) {
      void finishRegistration();
      return;
    }
    // Spec 91 — registrar el surveyId antes de reset() (que lo borra del
    // store de la encuesta): el orquestador lo usa para esperar a que este
    // bloque llegue al backend antes de pedir el siguiente paso, evitando la
    // carrera que reabría el mismo bloque.
    if (isInsideCampaign && surveyId) {
      setLastCompletedSurveyId(surveyId);
    }
    reset();
    // Spec 103 (C6) — el flujo por productor vuelve a la ficha, no a Campañas.
    if (productorFarmerId) {
      leaveToFarmer(router, productorFarmerId);
      return;
    }
    if (isInsideCampaign && sessionId) {
      markStepCompleted();
      // dismissTo(pre-survey) + push, not replace: question/start screens for
      // the instrument just finished were reached via push and would
      // otherwise remain reachable via the native back button (see
      // src/lib/campaignNavigation.ts).
      advanceWithinCampaign(
        router,
        campaign!.campaignId,
        `/campaign/${campaign!.campaignId}/session/${sessionId}/orchestrator`,
      );
    } else {
      router.replace("/");
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <View style={styles.icon}>
          <Check size={42} color={colors.successFg} strokeWidth={2.8} />
        </View>
        <Text style={styles.title}>Encuesta completada</Text>
        <Text style={styles.subtitle}>
          {instrumentName}
          {farmerName ? `\n${farmerName}` : ""}
        </Text>

        {isInsideCampaign && currentStep ? (
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel} numberOfLines={1}>
                {campaign?.name?.toUpperCase()}
              </Text>
              <Text style={styles.progressCount}>
                {completedSteps} de {currentStep.totalSteps}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: progressPercent as DimensionValue }]} />
            </View>
          </View>
        ) : null}

        {registroError ? (
          <View style={styles.offlineBanner}>
            <TriangleAlert size={16} color={colors.warningFg} strokeWidth={2.2} />
            <Text style={styles.offlineBannerText}>{registroError}</Text>
          </View>
        ) : null}

        <View style={styles.offlineBanner}>
          <TriangleAlert size={16} color={colors.warningFg} strokeWidth={2.2} />
          <Text style={styles.offlineBannerText}>
            Guardada en el dispositivo. Se envía sola al recuperar conexión.
          </Text>
        </View>
      </View>

      {/* Desviación del mockup: el diseño muestra "Siguiente paso" +
          "Volver al inicio" siempre juntos. Se conserva el único botón
          condicional que ya existía — agregar "Volver al inicio" dentro de
          una campaña activa introduciría una acción nueva (abandonar la
          campaña a mitad de un paso) que este spec no pidió ni aprobó. */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.button} onPress={handleContinue} accessibilityRole="button">
          <Text style={styles.buttonText}>
            {registro
              ? "Ver productor"
              : isInsideCampaign
                ? "Siguiente paso"
                : productorFarmerId
                  ? "Volver al productor"
                  : "Volver al inicio"}
          </Text>
          {isInsideCampaign && (
            <ArrowRight size={19} color={colors.brandForeground} strokeWidth={2.6} />
          )}
        </TouchableOpacity>
      </View>

      <DocumentCollisionModal
        visible={!!collision}
        documentId={collision?.documentId ?? ""}
        existingFarmerName={collision?.existingFarmerName ?? ""}
        submittedName={collision?.submittedName ?? ""}
        isLoading={finishing}
        // Sin conexión también se puede: la identidad se confirma contra la caché
        // del dispositivo y el backend la resuelve definitivamente al sincronizar.
        allowSamePerson
        onCorrectDocument={() => setCollision(null)}
        onSamePerson={() => void resolveCollision("same_person")}
        onSeparatePerson={() => void resolveCollision("separate_person")}
        onRequestClose={() => setCollision(null)}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },
    content: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    icon: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.successBg,
      borderWidth: 2,
      borderColor: colors.successFg,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
    },
    title: {
      fontSize: 24,
      fontFamily: Fonts.extraBold,
      color: colors.textPrimary,
      letterSpacing: -0.3,
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 24,
    },
    progressCard: {
      width: "100%",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    progressHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: 9,
      gap: 8,
    },
    progressLabel: { flex: 1, fontSize: 11.5, fontFamily: Fonts.bold, color: colors.textMuted },
    progressCount: { fontSize: 12, fontFamily: Fonts.extraBold, color: colors.textPrimary },
    progressTrack: {
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 99,
      overflow: "hidden",
    },
    progressFill: { height: 6, backgroundColor: colors.brand, borderRadius: 99 },
    offlineBanner: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: colors.warningBg,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    offlineBannerText: { flex: 1, fontSize: 11.5, fontFamily: Fonts.semiBold, color: colors.warningFg, lineHeight: 16 },
    footer: {
      padding: 14,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      backgroundColor: colors.brand,
      borderRadius: 11,
      paddingVertical: 17,
    },
    buttonText: { fontSize: 15.5, fontFamily: Fonts.extraBold, color: colors.brandForeground },
  });
}
