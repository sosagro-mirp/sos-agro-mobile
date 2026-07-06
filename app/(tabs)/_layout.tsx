import { Tabs } from "expo-router";
import { Map, FileText, RefreshCw, MessageSquare } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../src/store/useAuthStore";
import { useSyncStatusStore } from "../../src/store/useSyncStatusStore";
import { Fonts } from "../../src/theme/fonts";
import { useRef } from "react";
import { useRouter } from "expo-router";

const GREEN = "#1B6B3A";

function TabsHeader() {
  const { user, logout } = useAuthStore();
  const { isOnline, pendingCount } = useSyncStatusStore();
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
        <Pressable onPress={handleTitleTap} accessibilityRole="text">
          <Text style={styles.appName}>SOS Agro 4C</Text>
          {user?.name ? (
            <Text style={styles.userName}>{user.name}</Text>
          ) : null}
        </Pressable>
        <View style={styles.headerRight}>
          <View style={styles.statusPill}>
            <View style={[styles.dot, isOnline ? styles.dotOnline : styles.dotOffline]} />
            <Text style={styles.statusText}>{isOnline ? "En línea" : "Sin conexión"}</Text>
          </View>
          <Pressable onPress={logout} style={styles.logoutBtn} accessibilityRole="button">
            <Text style={styles.logoutText}>Salir</Text>
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
  return (
    <View style={{ flex: 1 }}>
      <TabsHeader />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: GREEN,
          tabBarInactiveTintColor: "#9CA3AF",
          tabBarStyle: styles.tabBar,
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
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 20, color }}>🗺️</Text>
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: GREEN,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  appName: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  userName: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "rgba(255,255,255,0.75)",
    marginTop: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotOnline: { backgroundColor: "#86EFAC" },
  dotOffline: { backgroundColor: "#FCA5A5" },
  statusText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#fff",
  },
  logoutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  logoutText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: "#fff",
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
  tabBar: {
    backgroundColor: "#fff",
    borderTopColor: "#E5E7EB",
    borderTopWidth: 1,
    height: 62,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
  },
});
