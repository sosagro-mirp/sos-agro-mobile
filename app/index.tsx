import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../src/store/useAuthStore";
import { useSyncStatusStore } from "../src/store/useSyncStatusStore";
import { Fonts } from "../src/theme/fonts";
import { useRef } from "react";

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { pendingCount, isOnline } = useSyncStatusStore();

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

    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 1500);
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={handleTitleTap} accessibilityRole="text">
          <Text style={styles.greeting}>
            Hola, {user?.name}
          </Text>
          <Text style={styles.role}>{user?.role ?? ""}</Text>
        </Pressable>
        <View style={styles.statusRow}>
          <View style={[styles.dot, isOnline ? styles.dotOnline : styles.dotOffline]} />
          <Text style={styles.statusText}>{isOnline ? "En línea" : "Sin conexión"}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        <NavCard
          title="Campañas"
          description="Ver y llenar campañas activas"
          onPress={() => router.push("/campaign")}
        />
        <NavCard
          title="Borradores"
          description="Encuestas en progreso"
          onPress={() => router.push("/drafts")}
        />
        <NavCard
          title={`Sincronización${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
          description="Estado de envíos pendientes"
          onPress={() => router.push("/sync")}
          highlight={pendingCount > 0}
        />
      </ScrollView>

      <Pressable style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function NavCard({
  title,
  description,
  onPress,
  highlight = false,
}: {
  title: string;
  description: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        highlight && styles.cardHighlight,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={[styles.cardTitle, highlight && styles.cardTitleHighlight]}>
        {title}
      </Text>
      <Text style={styles.cardDesc}>{description}</Text>
    </Pressable>
  );
}

const GREEN = "#1B6B3A";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: GREEN,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  greeting: {
    fontSize: 22,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  role: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
    textTransform: "capitalize",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOnline: { backgroundColor: "#86EFAC" },
  dotOffline: { backgroundColor: "#FCA5A5" },
  statusText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "rgba(255,255,255,0.85)",
  },
  grid: {
    padding: 20,
    gap: 12,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardHighlight: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: Fonts.semiBold,
    color: "#111827",
    marginBottom: 4,
  },
  cardTitleHighlight: {
    color: "#B45309",
  },
  cardDesc: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#6B7280",
  },
  logoutButton: {
    margin: 20,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
  },
  logoutText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: "#6B7280",
  },
});
