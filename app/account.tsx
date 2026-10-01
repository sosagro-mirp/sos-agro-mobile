import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, LogOut, RefreshCw, TriangleAlert, UserRoundCog } from "lucide-react-native";
import { useAuthStore } from "../src/store/useAuthStore";
import { useSyncStatusStore } from "../src/store/useSyncStatusStore";
import { offlineCredentialStorage } from "../src/storage/offlineCredentialStorage";
import { getOwnerPendingCounts } from "../src/storage/localPendingCounts";
import { evaluateOfflineLogin, OFFLINE_CREDENTIAL_MAX_AGE_DAYS } from "../src/lib/offlineCredential";
import {
  PENDING_KIND_LABELS,
  resolveLogoutGuard,
  type OwnerPendingCounts,
} from "../src/lib/logoutGuard";
import { getInitials } from "../src/lib/getInitials";
import { formatAvailableUntil } from "../src/hooks/useKnownUsers";
import { AppText } from "../src/components/common/AppText";
import { ConfirmSheet } from "../src/components/common/ConfirmSheet";
import { ReauthModal } from "../src/components/auth/ReauthModal";
import { Fonts } from "../src/theme/fonts";
import { useTheme } from "../src/theme/ThemeProvider";
import type { ThemeColors } from "../src/theme/colors";

const DAY_MS = 24 * 60 * 60 * 1000;
const NO_PENDING: OwnerPendingCounts = { queue: 0, drafts: 0, changeRequests: 0, consents: 0, plots: 0 };

type SheetKind = "switch" | "forget" | "forget_confirm" | null;

/**
 * Spec 86 (D8, CA-20/21/22): cuenta del encuestador. "Cambiar de encuestador"
 * conserva todo (token, credencial y cola); "Cerrar sesión y olvidar esta
 * tablet" exige una segunda confirmación cuando hay pendientes y NUNCA borra
 * filas de SQLite.
 */
export default function AccountScreen() {
  const router = useRouter();
  const { user, serverState, switchUser, forgetDevice } = useAuthStore();
  const authBlocked = useSyncStatusStore((s) => s.authBlocked);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [counts, setCounts] = useState<OwnerPendingCounts>(NO_PENDING);
  const [offlineUntil, setOfflineUntil] = useState<number | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [enableOpen, setEnableOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setCounts(await getOwnerPendingCounts(user.userId));
    } catch {
      setCounts(NO_PENDING);
    }
    const cred = await offlineCredentialStorage.getCredential(user.userId);
    const ready = !!cred && evaluateOfflineLogin(cred, Date.now()).allowed;
    setOfflineReady(ready);
    setOfflineUntil(cred ? cred.lastOnlineLoginAt + OFFLINE_CREDENTIAL_MAX_AGE_DAYS * DAY_MS : null);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!user) return null;

  const fullName = `${user.name} ${user.lastName}`.trim();
  const forgetGuard = resolveLogoutGuard("forget_device", counts);
  const totalPending = Object.values(counts).reduce((a, b) => a + b, 0);
  const serverText =
    serverState === "valid"
      ? "Vigente"
      : authBlocked || serverState === "reauth_required"
        ? "Sesión por renovar"
        : "Sin confirmar (se confirma al tener conexión)";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setSheet(null);
    }
    // El AuthGuard lleva a /login en cuanto `user` queda en null.
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ArrowLeft size={22} color={colors.headerFg} />
        </Pressable>
        <AppText style={styles.headerTitle}>Mi cuenta</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <AppText style={styles.avatarText}>{getInitials(fullName || user.email)}</AppText>
          </View>
          <AppText style={styles.name}>{fullName || user.email}</AppText>
          <AppText style={styles.muted}>{user.email}</AppText>
        </View>

        <View style={styles.card}>
          <Row styles={styles} label="Sesión con el servidor" value={serverText} />
          <Row
            styles={styles}
            label="Ingreso sin conexión"
            value={
              offlineReady && offlineUntil
                ? `Disponible hasta ${formatAvailableUntil(offlineUntil)}`
                : "No habilitado"
            }
          />
          {!offlineReady ? (
            <Pressable
              style={styles.linkBtn}
              onPress={() => setEnableOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Habilitar ingreso sin conexión"
            >
              <AppText style={styles.linkText}>Habilitar ingreso sin conexión</AppText>
            </Pressable>
          ) : null}
          <Row
            styles={styles}
            label="Pendientes de este encuestador"
            value={totalPending === 0 ? "Ninguno" : `${totalPending}`}
          />
        </View>

        <Pressable
          style={styles.primaryBtn}
          onPress={() => setSheet("switch")}
          accessibilityRole="button"
          accessibilityLabel="Cambiar de encuestador"
        >
          <UserRoundCog size={18} color={colors.brandForeground} />
          <AppText style={styles.primaryText}>Cambiar de encuestador</AppText>
        </Pressable>
        <AppText style={styles.hint}>
          Guarda tu sesión y tus pendientes. Otro encuestador puede entrar y tú volverás a
          entrar con tu contraseña, incluso sin internet.
        </AppText>

        <View style={styles.danger}>
          <View style={styles.dangerTitleRow}>
            <TriangleAlert size={16} color={colors.dangerFg} />
            <AppText style={styles.dangerTitle}>Zona de riesgo</AppText>
          </View>
          <Pressable
            style={styles.dangerBtn}
            onPress={() => setSheet("forget")}
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión y olvidar esta tablet"
          >
            <LogOut size={17} color={colors.dangerFg} />
            <AppText style={styles.dangerBtnText}>Cerrar sesión y olvidar esta tablet</AppText>
          </Pressable>
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={sheet === "switch"}
        icon={UserRoundCog}
        tone="brand"
        title="¿Cambiar de encuestador?"
        body="Tu sesión, tus borradores y tus envíos pendientes se quedan guardados en esta tablet."
        primaryAction={{ label: "Cambiar de encuestador", onPress: () => void run(switchUser) }}
        secondaryAction={{ label: "Cancelar", onPress: () => setSheet(null) }}
        isLoading={busy}
        onRequestClose={() => setSheet(null)}
      />

      <ConfirmSheet
        visible={sheet === "forget"}
        icon={TriangleAlert}
        tone="danger"
        title={
          forgetGuard.level === "strong"
            ? "Tienes datos sin enviar"
            : "¿Olvidar esta tablet?"
        }
        body={
          forgetGuard.level === "strong"
            ? `${forgetGuard.reasons
                .map((r) => PENDING_KIND_LABELS[r.kind](r.count))
                .join("; ")}. No se borran, pero quedarán esperando a que ${user.name} vuelva a ingresar con internet para enviarse.`
            : "Se cerrará tu sesión y esta tablet olvidará tu contraseña. Para volver a entrar necesitarás internet."
        }
        primaryAction={
          forgetGuard.level === "strong"
            ? {
                label: "Ir a Sincronización",
                icon: RefreshCw,
                onPress: () => {
                  setSheet(null);
                  router.replace("/(tabs)/sync");
                },
              }
            : { label: "Cancelar", onPress: () => setSheet(null) }
        }
        secondaryAction={
          forgetGuard.level === "strong"
            ? { label: "Cancelar", onPress: () => setSheet(null) }
            : undefined
        }
        destructiveAction={{
          label:
            forgetGuard.level === "strong"
              ? "Entiendo, olvidar de todos modos"
              : "Cerrar sesión y olvidar esta tablet",
          // Con pendientes NO se ejecuta de una vez: pasa a una segunda
          // confirmación explícita (spec 86, CA-22).
          onPress: () =>
            forgetGuard.level === "strong" ? setSheet("forget_confirm") : void run(forgetDevice),
        }}
        isLoading={busy}
        onRequestClose={() => setSheet(null)}
      />

      <ConfirmSheet
        visible={sheet === "forget_confirm"}
        icon={TriangleAlert}
        tone="danger"
        title="Última confirmación"
        body={`Vas a cerrar la sesión de ${user.name} y olvidar esta tablet con datos sin enviar. Los datos se conservan, pero no se enviarán hasta que ${user.name} vuelva a ingresar con internet.`}
        primaryAction={{ label: "No, volver", onPress: () => setSheet(null) }}
        destructiveAction={{
          label: "Sí, olvidar esta tablet",
          onPress: () => void run(forgetDevice),
        }}
        isLoading={busy}
        onRequestClose={() => setSheet(null)}
      />

      <ReauthModal
        visible={enableOpen}
        mode="enable"
        onClose={() => {
          setEnableOpen(false);
          void load();
        }}
      />
    </SafeAreaView>
  );
}

function Row({
  styles,
  label,
  value,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <AppText style={styles.rowLabel}>{label}</AppText>
      <AppText style={styles.rowValue}>{value}</AppText>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.headerBg,
    },
    backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontFamily: Fonts.bold, fontSize: 18, color: colors.headerFg },
    content: { padding: 16, gap: 14 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
      marginBottom: 10,
    },
    avatarText: { fontFamily: Fonts.bold, fontSize: 20, color: colors.brandForeground },
    name: { fontFamily: Fonts.bold, fontSize: 18, color: colors.textPrimary, textAlign: "center" },
    muted: { fontFamily: Fonts.regular, fontSize: 13, color: colors.textMuted, textAlign: "center" },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      paddingVertical: 8,
    },
    rowLabel: { flex: 1, fontFamily: Fonts.medium, fontSize: 13.5, color: colors.textMuted },
    rowValue: { flex: 1, fontFamily: Fonts.semiBold, fontSize: 13.5, color: colors.textPrimary, textAlign: "right" },
    linkBtn: { minHeight: 44, justifyContent: "center" },
    linkText: { fontFamily: Fonts.semiBold, fontSize: 14, color: colors.brand, textDecorationLine: "underline" },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      minHeight: 52,
      borderRadius: 12,
      backgroundColor: colors.brand,
    },
    primaryText: { fontFamily: Fonts.semiBold, fontSize: 15.5, color: colors.brandForeground },
    hint: { fontFamily: Fonts.regular, fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },
    danger: {
      marginTop: 18,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.dangerFg,
      backgroundColor: colors.dangerBg,
      gap: 10,
    },
    dangerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dangerTitle: { fontFamily: Fonts.bold, fontSize: 13.5, color: colors.dangerFg },
    dangerBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 48,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    dangerBtnText: { flex: 1, fontFamily: Fonts.semiBold, fontSize: 14, color: colors.dangerFg },
  });
}
