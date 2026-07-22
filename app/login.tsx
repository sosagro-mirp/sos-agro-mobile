import { useState } from "react";
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

const GREEN = "#1B6B3A";

export default function LoginScreen() {
  const { login, loading, error, clearError } = useAuthStore();

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
    // Outer View fills the screen with green — covers any gap left by the keyboard
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
                placeholderTextColor="#9CA3AF"
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
                  placeholderTextColor="#9CA3AF"
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
                <ActivityIndicator color="#fff" />
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

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: GREEN,
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
    color: "#fff",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "rgba(255,255,255,0.7)",
    marginTop: 6,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#fff",
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
    color: "#111827",
    marginBottom: 24,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#374151",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#111827",
    backgroundColor: "#F9FAFB",
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
    color: GREEN,
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
    fontFamily: Fonts.regular,
  },
  button: {
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: "#6B9E7E",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
});
