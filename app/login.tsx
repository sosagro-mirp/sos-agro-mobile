import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CircleAlert, Eye, EyeOff, LoaderCircle, Shield } from "lucide-react-native";
import { useAuthStore } from "../src/store/useAuthStore";
import { Fonts } from "../src/theme/fonts";
import { useTheme } from "../src/theme/ThemeProvider";
import type { ThemeColors } from "../src/theme/colors";
import { ThemeToggle } from "../src/components/common/ThemeToggle";

/**
 * Ícono girando con `Animated` en vez de `ActivityIndicator` — spec 74,
 * mapa de reemplazo de la hoja de sistema (`LoaderCircle 16/42` reemplaza
 * todo `ActivityIndicator`). Solo para este botón: el resto de la app sigue
 * usando `ActivityIndicator` hasta que su propia pantalla se migre.
 */
function SpinningLoader({ size, color }: { size: number; color: string }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <LoaderCircle size={size} color={color} />
    </Animated.View>
  );
}

export default function LoginScreen() {
  const { login, loading, error, clearError } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = () => {
    if (!email.trim() || !password) return;
    clearError();
    login(email.trim().toLowerCase(), password);
  };

  const isDisabled = loading || !email.trim() || !password;

  return (
    // Outer View fills the screen con el fondo del shell (spec 74, Fase 2:
    // ya no es colors.brand a secas — en oscuro pasa a headerBg, igual que
    // el header de la app, en vez de un amarillo institucional a pantalla
    // completa) — cubre cualquier hueco que deje el teclado.
    <View style={styles.fill}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "android" ? -24 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.themeRow}>
            <ThemeToggle variant="segmented" size={16} />
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Sos Agro 4.C</Text>
            <Text style={styles.subtitle}>
              Caracterización agrícola en campo.{"\n"}Funciona sin conexión.
            </Text>
          </View>

          <View style={styles.card}>
            {error ? (
              <View style={styles.errorBox}>
                <CircleAlert size={17} color={colors.dangerFg} style={styles.errorIcon} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>CORREO</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="usuario@ejemplo.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>CONTRASEÑA</Text>
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                  accessibilityLabel={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <EyeOff size={14} color={colors.brand} />
                  ) : (
                    <Eye size={14} color={colors.brand} />
                  )}
                  <Text style={styles.eyeText}>{showPassword ? "Ocultar" : "Ver"}</Text>
                </Pressable>
              </View>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                onSubmitEditing={handleLogin}
                returnKeyType="done"
              />
            </View>

            <Pressable
              style={[styles.button, isDisabled && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isDisabled}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión"
            >
              {loading ? (
                <>
                  <SpinningLoader size={17} color={colors.brandForeground} />
                  <Text style={styles.buttonText}>Ingresando…</Text>
                </>
              ) : (
                <Text style={styles.buttonText}>Ingresar</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.spacer} />

          <View style={styles.footer}>
            <Shield size={14} color={colors.headerSub} />
            <Text style={styles.footerText}>Tus respuestas se guardan en el dispositivo</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: {
      flex: 1,
      backgroundColor: colors.headerBg,
    },
    kav: {
      flex: 1,
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 14,
      paddingBottom: 26,
    },
    themeRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
    },
    header: {
      alignItems: "center",
      paddingTop: 40,
      paddingBottom: 30,
    },
    title: {
      fontSize: 30,
      fontFamily: Fonts.extraBold,
      color: colors.headerFg,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: colors.headerSub,
      marginTop: 9,
      textAlign: "center",
      lineHeight: 20,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 22,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    field: {
      marginBottom: 18,
    },
    labelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 7,
    },
    label: {
      fontSize: 11.5,
      fontFamily: Fonts.semiBold,
      color: colors.textMuted,
      letterSpacing: 0.4,
      marginBottom: 7,
    },
    input: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceMuted,
    },
    eyeButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    eyeText: {
      fontSize: 11.5,
      fontFamily: Fonts.semiBold,
      color: colors.brand,
    },
    errorBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: colors.dangerBg,
      borderRadius: 10,
      padding: 12,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    errorIcon: {
      marginTop: 1,
      flexShrink: 0,
    },
    errorText: {
      flex: 1,
      color: colors.dangerFg,
      fontSize: 12.5,
      fontFamily: Fonts.medium,
      lineHeight: 18,
    },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      minHeight: 48,
      backgroundColor: colors.brand,
      borderRadius: 10,
      paddingVertical: 16,
      marginTop: 4,
    },
    buttonDisabled: {
      backgroundColor: colors.textMuted,
    },
    buttonText: {
      color: colors.brandForeground,
      fontSize: 15,
      fontFamily: Fonts.semiBold,
    },
    spacer: {
      flex: 1,
      minHeight: 20,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingTop: 10,
    },
    footerText: {
      fontSize: 11.5,
      fontFamily: Fonts.regular,
      color: colors.headerSub,
    },
  });
}
