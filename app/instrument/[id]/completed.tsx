import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInstrumentSurveyStore } from "../../../src/store/useInstrumentSurveyStore";
import { useCampaignSessionStore } from "../../../src/store/useCampaignSessionStore";
import { Fonts } from "../../../src/theme/fonts";

export default function InstrumentCompletedScreen() {
  const router = useRouter();
  const { instrumentName, campaignSessionId, reset } = useInstrumentSurveyStore();
  const { campaign, currentStep, sessionId, markStepCompleted } =
    useCampaignSessionStore();

  const isInsideCampaign = Boolean(campaignSessionId && campaign);

  const handleContinue = () => {
    reset();
    if (isInsideCampaign && sessionId) {
      markStepCompleted();
      router.replace(
        `/campaign/${campaign!.campaignId}/session/${sessionId}/orchestrator`
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

const GREEN = "#1B6B3A";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
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
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  iconText: { fontSize: 36, color: "#fff" },
  title: { fontSize: 24, fontFamily: Fonts.bold, color: "#111827" },
  subtitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: "#6B7280" },
  progress: { fontSize: 13, fontFamily: Fonts.regular, color: GREEN },
  description: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 20,
  },
  button: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 48,
    marginTop: 12,
  },
  buttonText: { fontSize: 17, fontFamily: Fonts.bold, color: "#fff" },
});
