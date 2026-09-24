import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { KeyRound } from "lucide-react-native";
import { AppText } from "../common/AppText";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import { useSyncStatusStore } from "../../store/useSyncStatusStore";
import { ReauthModal } from "./ReauthModal";

/**
 * Spec 86 (D9, CA-2): aviso NO bloqueante bajo el header cuando el token del
 * usuario activo venció y hay red. Sin red no aparece: ahí no hay nada que
 * renovar y la app sigue trabajando en local.
 */
export function ReauthBanner() {
  const authBlocked = useSyncStatusStore((s) => s.authBlocked);
  const reachability = useSyncStatusStore((s) => s.reachability);
  const pendingCount = useSyncStatusStore((s) => s.pendingCount);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (!authBlocked || reachability === "offline") return null;

  return (
    <>
      <View style={styles.banner}>
        <KeyRound size={16} color={colors.warningFg} />
        <AppText style={styles.text}>
          {pendingCount > 0
            ? `Tu sesión con el servidor venció. Ingresa tu contraseña para sincronizar ${pendingCount} envío${pendingCount !== 1 ? "s" : ""}.`
            : "Tu sesión con el servidor venció. Ingresa tu contraseña para volver a sincronizar."}
        </AppText>
        <Pressable
          onPress={() => setOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Renovar sesión"
        >
          <AppText style={styles.action}>Renovar</AppText>
        </Pressable>
      </View>
      <ReauthModal visible={open} onClose={close} />
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.warningBg,
      paddingVertical: 9,
      paddingHorizontal: 14,
    },
    text: { flex: 1, fontFamily: Fonts.medium, fontSize: 12.5, color: colors.warningFg, lineHeight: 17 },
    action: { fontFamily: Fonts.bold, fontSize: 13, color: colors.warningFg, textDecorationLine: "underline" },
  });
}
