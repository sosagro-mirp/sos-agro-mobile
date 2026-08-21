import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuthStore } from "../src/store/useAuthStore";
import { Fonts } from "../src/theme/fonts";
import { useTheme } from "../src/theme/ThemeProvider";
import type { ThemeColors } from "../src/theme/colors";

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
    // Outer View fills the screen with el color de marca — cubre cualquier
    // hueco que deje el teclado
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
          <View style={styles.header}>
            <Text style={styles.title}>Sos Agro 4.C</Text>
            <Text style={styles.subtitle}>Plataforma de caracterización agrícola</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Iniciar sesión</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Correo electrónico</Text>
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
              <Text style={styles.label}>Contraseña</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
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
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((v) => !v)}
                  accessibilityLabel={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  <Text style={styles.eyeText}>{showPassword ? "Ocultar" : "Ver"}</Text>
                </Pressable>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.button, isDisabled && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isDisabled}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión"
            >
              {loading ? (
                <ActivityIndicator color={colors.brandForeground} />
              ) : (
                <Text style={styles.buttonText}>Ingresar</Text>
              )}
            </Pressable>
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
      backgroundColor: colors.brand,
    },
    kav: {
      flex: 1,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingVertical: 32,
    },
    header: {
      alignItems: "center",
      marginBottom: 32,
    },
    title: {
      fontSize: 32,
      fontFamily: Fonts.extraBold,
      color: colors.brandForeground,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: colors.brandForeground,
      opacity: 0.7,
      marginTop: 6,
      textAlign: "center",
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    cardTitle: {
      fontSize: 20,
      fontFamily: Fonts.bold,
      color: colors.textPrimary,
      marginBottom: 24,
    },
    field: {
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontFamily: Fonts.semiBold,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceMuted,
    },
    passwordRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    passwordInput: {
      flex: 1,
    },
    eyeButton: {
      position: "absolute",
      right: 14,
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    eyeText: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: colors.brand,
    },
    errorBox: {
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    errorText: {
      color: colors.dangerFg,
      fontSize: 14,
      fontFamily: Fonts.regular,
    },
    button: {
      backgroundColor: colors.brand,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 8,
    },
    buttonDisabled: {
      backgroundColor: colors.textMuted,
    },
    buttonText: {
      color: colors.brandForeground,
      fontSize: 16,
      fontFamily: Fonts.bold,
    },
  });
}
