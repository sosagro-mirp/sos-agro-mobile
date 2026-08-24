import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInstrumentSurveyStore } from "../../../src/store/useInstrumentSurveyStore";
import { useCampaignSessionStore } from "../../../src/store/useCampaignSessionStore";
import { advanceWithinCampaign } from "../../../src/lib/campaignNavigation";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";

export default function InstrumentCompletedScreen() {
  const router = useRouter();
  const { instrumentName, campaignSessionId, reset } = useInstrumentSurveyStore();
  const { campaign, currentStep, sessionId, markStepCompleted } =
    useCampaignSessionStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isInsideCampaign = Boolean(campaignSessionId && campaign);

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
          <Text style={styles.iconText}>✓</Text>
        </View>
        <Text style={styles.title}>Encuesta completada</Text>
        <Text style={styles.subtitle}>{instrumentName}</Text>

        {isInsideCampaign && currentStep ? (
          <Text style={styles.progress}>
            Paso {currentStep.completedCount + 1} de {currentStep.totalSteps}
          </Text>
        ) : null}

        <Text style={styles.description}>
          Las respuestas se enviarán al servidor cuando haya conexión.
        </Text>

        <Pressable style={styles.button} onPress={handleContinue}>
          <Text style={styles.buttonText}>
            {isInsideCampaign ? "Siguiente paso" : "Volver al inicio"}
          </Text>
        </Pressable>
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
      paddingHorizontal: 32,
      gap: 14,
    },
    icon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    iconText: { fontSize: 36, color: colors.brandForeground },
    title: { fontSize: 24, fontFamily: Fonts.bold, color: colors.textPrimary },
    subtitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: colors.textMuted },
    progress: { fontSize: 13, fontFamily: Fonts.regular, color: colors.brand },
    description: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 20,
    },
    button: {
      backgroundColor: colors.brand,
      borderRadius: 12,
      paddingVertical: 18,
      paddingHorizontal: 48,
      marginTop: 12,
    },
    buttonText: { fontSize: 17, fontFamily: Fonts.bold, color: colors.brandForeground },
  });
}
