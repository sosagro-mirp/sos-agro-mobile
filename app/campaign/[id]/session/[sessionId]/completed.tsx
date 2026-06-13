import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCampaignSessionStore } from "../../../../../src/store/useCampaignSessionStore";
import { Fonts } from "../../../../../src/theme/fonts";

export default function CampaignCompletedScreen() {
  const router = useRouter();
  const { campaign, reset } = useCampaignSessionStore();

  const handleFinish = () => {
    reset();
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <View style={styles.icon}>
          <Text style={styles.iconText}>✓</Text>
        </View>
        <Text style={styles.title}>Visita completada</Text>
        <Text style={styles.campaignName}>{campaign?.name ?? ""}</Text>
        <Text style={styles.description}>
          Todos los pasos han sido registrados. Los datos se enviarán al servidor
          cuando haya conexión disponible.
        </Text>
        <Pressable style={styles.button} onPress={handleFinish}>
          <Text style={styles.buttonText}>Volver al inicio</Text>
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
    gap: 16,
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
  title: { fontSize: 26, fontFamily: Fonts.bold, color: "#111827" },
  campaignName: { fontSize: 15, fontFamily: Fonts.semiBold, color: "#6B7280" },
  description: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
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
