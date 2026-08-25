import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check } from "lucide-react-native";
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
          <Check size={42} color={colors.successFg} strokeWidth={2.8} />
        </View>
        <Text style={styles.title}>Visita completada</Text>
        <Text style={styles.campaignName}>{campaign?.name ?? ""}</Text>
        <Text style={styles.description}>
          Todos los pasos han sido registrados. Los datos se enviarán al servidor
          cuando haya conexión disponible.
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.button} onPress={handleFinish} accessibilityRole="button">
          <Text style={styles.buttonText}>Volver al inicio</Text>
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
    campaignName: { fontSize: 13, fontFamily: Fonts.semiBold, color: colors.textMuted, marginBottom: 16 },
    description: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 20,
    },
    footer: {
      padding: 14,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    button: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
      borderRadius: 11,
      paddingVertical: 17,
    },
    buttonText: { fontSize: 15.5, fontFamily: Fonts.extraBold, color: colors.brandForeground },
  });
}
