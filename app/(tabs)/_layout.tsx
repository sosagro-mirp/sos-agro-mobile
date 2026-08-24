import { Tabs, useRouter } from "expo-router";
import {
  Clock,
  LandPlot,
  LogOut,
  Map,
  FileText,
  MessageSquare,
  RefreshCw,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../src/store/useAuthStore";
import { useSyncStatusStore } from "../../src/store/useSyncStatusStore";
import { Fonts } from "../../src/theme/fonts";
import { useTheme } from "../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../src/theme/colors";
import type { EffectiveTheme } from "../../src/theme/resolveTheme";
import { AppText } from "../../src/components/common/AppText";
import { ThemeToggle } from "../../src/components/common/ThemeToggle";
import { resolveTabBarStyle } from "../../src/lib/resolveTabBarStyle";
import { useMemo, useRef } from "react";

function TabsHeader() {
  const { user, logout } = useAuthStore();
  const { isOnline, pendingCount } = useSyncStatusStore();
  const { colors, effectiveTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, effectiveTheme), [colors, effectiveTheme]);
  const router = useRouter();

  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTitleTap() {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      router.push("/dev/logs");
      return;
    }
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 1500);
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.headerContainer}>
      <View style={styles.header}>
        <Pressable style={styles.headerLeft} onPress={handleTitleTap} accessibilityRole="text">
          <Text style={styles.appName}>Sos Agro 4.C</Text>
          {user?.name ? (
            <AppText style={styles.userName} numberOfLines={1}>{user.name}</AppText>
          ) : null}
        </Pressable>
        <View style={styles.headerRight}>
          <View style={[styles.statusPill, !isOnline && styles.statusPillOffline]}>
            <View style={[styles.dot, isOnline ? styles.dotOnline : styles.dotOffline]} />
            <AppText style={[styles.statusText, !isOnline && styles.statusTextOffline]}>
              {isOnline ? "En línea" : "Sin conexión"}
            </AppText>
          </View>
          <View style={styles.themeToggleWrapper}>
            <ThemeToggle size={16} color={colors.headerFg} />
          </View>
          <Pressable onPress={logout} style={styles.logoutBtn} accessibilityRole="button">
            <LogOut size={15} color={colors.headerFg} />
            <AppText style={styles.logoutText}>Salir</AppText>
          </Pressable>
        </View>
      </View>
      {pendingCount > 0 ? (
        <View style={styles.pendingBanner}>
          <Clock size={15} color={colors.warningFg} />
          <Text style={styles.pendingText}>
            {pendingCount} encuesta{pendingCount !== 1 ? "s" : ""} pendiente{pendingCount !== 1 ? "s" : ""} de sincronizar
          </Text>
          <Pressable onPress={() => router.push("/(tabs)/sync")} hitSlop={8}>
            <Text style={styles.pendingAction}>Ver</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// Indicador de 2.5 px sobre la pestaña activa (spec 74, Fase 2). El tipo del
// parámetro queda en `any` documentado: `BottomTabBarButtonProps` vive en
// `@react-navigation/bottom-tabs`, dependencia transitiva de expo-router que
// este repo no declara en `package.json` — tiparlo exigiría agregarla como
// dependencia directa solo para el tipo.
// TODO: type this
function TabBarButton(props: any) {
  const { children, style, accessibilityState, onPress, ...rest } = props;
  const { colors } = useTheme();
  const selected = !!accessibilityState?.selected;

  return (
    <Pressable
      accessibilityState={accessibilityState}
      onPress={onPress}
      style={style}
      {...rest}
    >
      {selected ? (
        <View style={[tabButtonStyles.indicator, { backgroundColor: colors.brand }]} />
      ) : null}
      {children}
    </Pressable>
  );
}

const tabButtonStyles = StyleSheet.create({
  indicator: {
    position: "absolute",
    top: 0,
    left: "22%",
    right: "22%",
    height: 2.5,
    borderRadius: 99,
  },
});

export default function TabsLayout() {
  const { colors, effectiveTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, effectiveTheme), [colors, effectiveTheme]);
  const insets = useSafeAreaInsets();
  const tabBarStyle = useMemo(
    () => resolveTabBarStyle({ bottomInset: insets.bottom, colors }),
    [insets.bottom, colors],
  );

  return (
    <View style={{ flex: 1 }}>
      <TabsHeader />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle,
          tabBarLabelStyle: styles.tabLabel,
          tabBarButton: TabBarButton,
        }}
      >
        <Tabs.Screen
          name="campaign/index"
          options={{
            title: "Campañas",
            tabBarIcon: ({ color, size }) => (
              <Map size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="drafts/index"
          options={{
            title: "Borradores",
            tabBarIcon: ({ color, size }) => (
              <FileText size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="sync/index"
          options={{
            title: "Sincronización",
            tabBarIcon: ({ color, size }) => (
              <RefreshCw size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="requests/index"
          options={{
            title: "Solicitudes",
            tabBarIcon: ({ color, size }) => (
              <MessageSquare size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="plots"
          options={{
            title: "Lotes",
            tabBarIcon: ({ color, size }) => (
              <LandPlot size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

function createStyles(colors: ThemeColors, effectiveTheme: EffectiveTheme) {
  // Spec 74, Fase 0 — el header ya no usa colors.brand como fondo (verde en
  // claro, amarillo en oscuro): usa los tokens dedicados headerBg/headerFg,
  // que en oscuro son surfaceMuted con borde en vez del amarillo de marca.
  // Los overlays y puntos de estado se derivan de headerFg, que ya resuelve
  // el contraste correcto en ambos temas sin el cálculo especial que el
  // spec 63 tuvo que introducir.
  const overlaySoft = colors.headerPill;
  const overlayBorder = colors.headerBorder;

  return StyleSheet.create({
    headerContainer: {
      backgroundColor: colors.headerBg,
      borderBottomWidth: effectiveTheme === "dark" ? 1 : 0,
      borderBottomColor: colors.headerBorder,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    headerLeft: {
      flexShrink: 1,
    },
    appName: {
      fontSize: 18,
      fontFamily: Fonts.bold,
      color: colors.headerFg,
    },
    userName: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: colors.headerFg,
      opacity: 0.75,
      marginTop: 1,
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      // Fixed size: the connection-status pill and "Salir" are operationally
      // critical in the field and must stay fully visible even when the
      // left-side username is long or the system font scale is high (spec 24).
      // Only headerLeft (and userName inside it) shrinks/truncates.
      flexShrink: 0,
    },
    // Spec 74, Fase 2 — la píldora se tiñe de ámbar cuando está offline, en
    // vez de solo cambiar el color del punto: es el nivel 1 de la jerarquía
    // de conectividad de tres niveles (deuda #4), y debe leerse de un
    // vistazo sin depender del texto.
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: overlaySoft,
      borderWidth: 1,
      borderColor: overlayBorder,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
    },
    statusPillOffline: {
      backgroundColor: colors.warningBg,
      borderColor: colors.warningFg,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    dotOnline: { backgroundColor: colors.successFg },
    dotOffline: { backgroundColor: colors.warningFg },
    statusText: {
      fontSize: 11.5,
      fontFamily: Fonts.semiBold,
      color: colors.headerFg,
    },
    statusTextOffline: {
      color: colors.warningFg,
    },
    themeToggleWrapper: {
      width: 36,
      height: 36,
      borderRadius: 9,
      backgroundColor: overlaySoft,
      borderWidth: 1,
      borderColor: overlayBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    logoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 36,
      paddingHorizontal: 11,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: overlayBorder,
    },
    logoutText: {
      fontSize: 12,
      fontFamily: Fonts.semiBold,
      color: colors.headerFg,
    },
    pendingBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: colors.warningBg,
      borderBottomWidth: 1,
      borderBottomColor: colors.warningFg,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    pendingText: {
      flex: 1,
      fontSize: 12,
      fontFamily: Fonts.medium,
      color: colors.warningFg,
    },
    pendingAction: {
      fontSize: 11.5,
      fontFamily: Fonts.bold,
      color: colors.warningFg,
      textDecorationLine: "underline",
    },
    tabLabel: {
      fontFamily: Fonts.semiBold,
      fontSize: 11,
    },
  });
}
