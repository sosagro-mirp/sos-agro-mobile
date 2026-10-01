import React, { useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "./AppText";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import { getInitials } from "../../lib/getInitials";
import { useAuthStore } from "../../store/useAuthStore";

/**
 * Spec 86 (D8, CA-20): reemplaza el botón "Salir" del header. Abre la pantalla
 * de cuenta; ningún toque aquí cierra sesión. 36×36, igual que `ThemeToggle`.
 */
export function AccountButton() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fullName = `${user?.name ?? ""} ${user?.lastName ?? ""}`.trim();

  return (
    <Pressable
      onPress={() => router.push("/account")}
      style={styles.button}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={`Cuenta de ${fullName || "usuario"}`}
    >
      <AppText style={styles.text}>{getInitials(fullName || user?.email || "")}</AppText>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: {
      width: 36,
      height: 36,
      borderRadius: 18,
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.headerFg,
    },
    text: { fontFamily: Fonts.bold, fontSize: 12.5, color: colors.headerFg },
  });
}
