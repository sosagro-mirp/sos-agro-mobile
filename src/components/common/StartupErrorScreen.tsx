import React, { useMemo } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import { TriangleAlert } from "lucide-react-native";
import { AppText } from "./AppText";
import { PrimaryButton } from "./PrimaryButton";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

interface StartupErrorScreenProps {
  error: Error;
  onRetry: () => void;
}

/**
 * Spec 76, Fase 3 — pantalla de fallo de arranque.
 *
 * Hasta ahora, si `runMigrations()` rechazaba, `dbReady` se quedaba en false
 * para siempre: el splash no se ocultaba nunca y la app quedaba
 * indistinguible de un cuelgue, sin ningún mensaje. Este componente es la
 * ruta de salida — dice qué pasó y ofrece reintentar.
 *
 * No sustituye a los providers, solo al stack de navegación: desmontar
 * providers es lo que provocó el bucle infinito de remontaje del 2026-08-18
 * (ver el comentario de `src/theme/ThemeProvider.tsx`).
 */
export function StartupErrorScreen({ error, onRetry }: StartupErrorScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.iconWrapper}>
          <TriangleAlert size={28} color={colors.dangerFg} strokeWidth={1.8} />
        </View>

        <AppText style={styles.title}>No se pudo iniciar la aplicación</AppText>

        <AppText style={styles.description}>
          Hubo un problema al preparar los datos guardados en este dispositivo. Tus encuestas
          pendientes no se han perdido: siguen almacenadas localmente.
        </AppText>

        <View style={styles.detailBox}>
          <AppText style={styles.detail}>{error.message}</AppText>
        </View>

        <View style={styles.action}>
          <PrimaryButton label="Reintentar" onPress={onRetry} />
        </View>

        <AppText style={styles.hint}>
          Si el problema persiste, cierra la aplicación por completo y vuelve a abrirla. Reporta el
          mensaje de arriba al equipo técnico.
        </AppText>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.surfaceMuted,
    },
    content: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    iconWrapper: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.dangerBg,
      marginBottom: 20,
    },
    title: {
      fontFamily: Fonts.extraBold,
      fontSize: 16,
      color: colors.textPrimary,
      textAlign: "center",
      marginBottom: 10,
    },
    description: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 19,
      marginBottom: 20,
    },
    detailBox: {
      width: "100%",
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.dangerBg,
      marginBottom: 24,
    },
    detail: {
      fontSize: 11.5,
      color: colors.dangerFg,
      textAlign: "center",
    },
    action: {
      width: "100%",
      marginBottom: 20,
    },
    hint: {
      fontSize: 11.5,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 17,
    },
  });
}
