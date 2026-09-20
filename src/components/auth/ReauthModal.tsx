import React, { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { AppText } from "../common/AppText";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import { useAuthStore } from "../../store/useAuthStore";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** `reauth` renueva el token; `enable` habilita el ingreso sin conexión (CA-19/TC-086-16). */
  mode?: "reauth" | "enable";
}

/**
 * Spec 86 (D9, CA-3): renueva la sesión con el servidor pidiendo solo la
 * contraseña, sin cambiar de pantalla ni reiniciar la navegación.
 */
export function ReauthModal({ visible, onClose, mode = "reauth" }: Props) {
  const { user, loading, error, reauthenticate, enableOfflineLogin, clearError } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [password, setPassword] = useState("");

  const close = () => {
    setPassword("");
    clearError();
    onClose();
  };

  // Si la acción termina sin error el modal se cierra solo y el campo se
  // limpia (la contraseña no queda en memoria del componente).
  const submit = async () => {
    if (!password || loading) return;
    await (mode === "enable" ? enableOfflineLogin(password) : reauthenticate(password));
    if (!useAuthStore.getState().error) close();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <AppText style={styles.title}>
            {mode === "enable" ? "Habilitar ingreso sin conexión" : "Renovar sesión"}
          </AppText>
          <AppText style={styles.body}>
            {mode === "enable"
              ? `Ingresa la contraseña de ${user?.name ?? "tu usuario"} para poder entrar a esta tablet sin internet. Necesitas conexión para confirmarla.`
              : `Ingresa la contraseña de ${user?.name ?? "tu usuario"} para enviar las encuestas pendientes. No se pierde nada de lo que ya guardaste.`}
          </AppText>
          {error ? <AppText style={styles.error}>{error}</AppText> : null}
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Contraseña"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            accessibilityLabel="Contraseña"
            onSubmitEditing={() => void submit()}
          />
          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={close} accessibilityRole="button">
              <AppText style={styles.secondaryText}>Ahora no</AppText>
            </Pressable>
            <Pressable
              style={[styles.primary, (!password || loading) && styles.disabled]}
              disabled={!password || loading}
              onPress={() => void submit()}
              accessibilityRole="button"
              accessibilityLabel={mode === "enable" ? "Habilitar ingreso sin conexión" : "Renovar sesión"}
            >
              {loading ? (
                <ActivityIndicator color={colors.brandForeground} />
              ) : (
                <AppText style={styles.primaryText}>{mode === "enable" ? "Habilitar" : "Renovar"}</AppText>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    card: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
    },
    title: { fontFamily: Fonts.bold, fontSize: 18, color: colors.textPrimary, marginBottom: 8 },
    body: { fontFamily: Fonts.regular, fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 14 },
    error: { fontFamily: Fonts.medium, fontSize: 13, color: colors.dangerFg, marginBottom: 10 },
    input: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceMuted,
      marginBottom: 16,
    },
    actions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
    secondary: {
      minHeight: 46,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryText: { fontFamily: Fonts.semiBold, fontSize: 14, color: colors.textPrimary },
    primary: {
      minHeight: 46,
      minWidth: 110,
      paddingHorizontal: 18,
      borderRadius: 10,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryText: { fontFamily: Fonts.semiBold, fontSize: 14, color: colors.brandForeground },
    disabled: { opacity: 0.5 },
  });
}
