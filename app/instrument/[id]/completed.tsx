import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View, type DimensionValue } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, ArrowRight, TriangleAlert } from "lucide-react-native";
import { useInstrumentSurveyStore } from "../../../src/store/useInstrumentSurveyStore";
import { useCampaignSessionStore } from "../../../src/store/useCampaignSessionStore";
import { advanceWithinCampaign } from "../../../src/lib/campaignNavigation";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";

export default function InstrumentCompletedScreen() {
  const router = useRouter();
  const { instrumentName, campaignSessionId, reset } = useInstrumentSurveyStore();
  const { campaign, currentStep, sessionId, farmerName, markStepCompleted } =
    useCampaignSessionStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isInsideCampaign = Boolean(campaignSessionId && campaign);
  const completedSteps = currentStep ? currentStep.completedCount + 1 : 0;
  const progressPercent = currentStep
    ? `${Math.round((completedSteps / currentStep.totalSteps) * 100)}%`
    : "0%";

  const handleContinue = () => {
    reset();
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
            {isInsideCampaign ? "Siguiente paso" : "Volver al inicio"}
          </Text>
          {isInsideCampaign && (
            <ArrowRight size={19} color={colors.brandForeground} strokeWidth={2.6} />
          )}
        </TouchableOpacity>
      </View>
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
