import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCampaignSessionStore } from "../../../../../src/store/useCampaignSessionStore";
import { Fonts } from "../../../../../src/theme/fonts";
import { useTheme } from "../../../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../../../src/theme/colors";

export default function CampaignCompletedScreen() {
  const router = useRouter();
  const { campaign, reset } = useCampaignSessionStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },
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
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    iconText: { fontSize: 36, color: colors.brandForeground },
    title: { fontSize: 26, fontFamily: Fonts.bold, color: colors.textPrimary },
    campaignName: { fontSize: 15, fontFamily: Fonts.semiBold, color: colors.textMuted },
    description: {
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 22,
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
