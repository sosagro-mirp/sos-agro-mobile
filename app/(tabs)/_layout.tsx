import { Tabs } from "expo-router";
import { Map, FileText, RefreshCw, MessageSquare, LandPlot } from "lucide-react-native";
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
import { useRouter } from "expo-router";

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
          <View style={styles.statusPill}>
            <View style={[styles.dot, isOnline ? styles.dotOnline : styles.dotOffline]} />
            <AppText style={styles.statusText}>
              {isOnline ? "En línea" : "Sin conexión"}
            </AppText>
          </View>
          <ThemeToggle color={colors.headerFg} />
          <Pressable onPress={logout} style={styles.logoutBtn} accessibilityRole="button">
            <AppText style={styles.logoutText}>Salir</AppText>
          </Pressable>
        </View>
      </View>
      {pendingCount > 0 ? (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            {pendingCount} encuesta{pendingCount !== 1 ? "s" : ""} pendiente{pendingCount !== 1 ? "s" : ""} de sincronizar
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

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
  const dotOnlineColor = effectiveTheme === "dark" ? "#166534" : "#86EFAC";
  const dotOfflineColor = effectiveTheme === "dark" ? "#991B1B" : "#FCA5A5";

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
      gap: 12,
      // Fixed size: the connection-status pill and "Salir" are operationally
      // critical in the field and must stay fully visible even when the
      // left-side username is long or the system font scale is high (spec 24).
      // Only headerLeft (and userName inside it) shrinks/truncates.
      flexShrink: 0,
    },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: overlaySoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    dotOnline: { backgroundColor: dotOnlineColor },
    dotOffline: { backgroundColor: dotOfflineColor },
    statusText: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: colors.headerFg,
    },
    logoutBtn: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: overlayBorder,
    },
    logoutText: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: colors.headerFg,
    },
    pendingBanner: {
      backgroundColor: "#B45309",
      paddingHorizontal: 20,
      paddingVertical: 6,
    },
    pendingText: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: "#FEF3C7",
    },
    tabLabel: {
      fontFamily: Fonts.semiBold,
      fontSize: 11,
    },
  });
}
