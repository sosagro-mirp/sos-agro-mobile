import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChangeRequestForm } from "../../../src/components/requests/ChangeRequestForm";
import { useChangeRequestStore } from "../../../src/store/useChangeRequestStore";
import { Fonts } from "../../../src/theme/fonts";

const GREEN = "#1B6B3A";

const STATUS_LABELS: Record<string, string> = {
  pending_sync: "Pendiente",
  open: "Abierta",
  resolved: "Resuelta",
};

const STATUS_COLORS: Record<string, string> = {
  pending_sync: "#F59E0B",
  open: "#3B82F6",
  resolved: "#16A34A",
};

export default function RequestsScreen() {
  const { requests, loadAll } = useChangeRequestStore();

  useEffect(() => {
    loadAll().catch(console.error);
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Solicitudes de cambio</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ChangeRequestForm />

        {requests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mis solicitudes</Text>
            {requests.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text
                    style={[
                      styles.statusBadge,
                      { color: STATUS_COLORS[r.status] ?? "#6B7280" },
                    ]}
                  >
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Text>
                  <Text style={styles.dateText}>
                    {r.createdAt.toLocaleDateString("es-CO")}
                  </Text>
                </View>
                <Text style={styles.description} numberOfLines={3}>
                  {r.description}
                </Text>
                {r.resolvedAt && (
                  <Text style={styles.resolvedAt}>
                    Resuelta el {r.resolvedAt.toLocaleDateString("es-CO")}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: { fontSize: 17, fontFamily: Fonts.bold, color: "#111827" },
  content: { padding: 20, gap: 20 },

  section: { gap: 10 },
  sectionTitle: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: "#374151",
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
  },
  dateText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#9CA3AF",
  },
  description: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#374151",
    lineHeight: 20,
  },
  resolvedAt: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: GREEN,
  },
});
