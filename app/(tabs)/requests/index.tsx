import { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChangeRequestForm } from "../../../src/components/requests/ChangeRequestForm";
import { useChangeRequestStore } from "../../../src/store/useChangeRequestStore";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";
import { logger } from "../../../src/lib/logger";

const STATUS_LABELS: Record<string, string> = {
  pending_sync: "Pendiente",
  open: "Abierta",
  resolved: "Resuelta",
};

function getStatusColors(colors: ThemeColors): Record<string, string> {
  return {
    pending_sync: colors.warningFg,
    open: colors.infoFg,
    resolved: colors.successFg,
  };
}

export default function RequestsScreen() {
  const { requests, loadAll } = useChangeRequestStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const statusColors = useMemo(() => getStatusColors(colors), [colors]);

  useEffect(() => {
    loadAll().catch((err) => logger.error('[Requests] loadAll failed', err));
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={[]}>
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
                      { color: statusColors[r.status] ?? colors.textMuted },
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: { fontSize: 17, fontFamily: Fonts.bold, color: colors.textPrimary },
    content: { padding: 20, gap: 20 },

    section: { gap: 10 },
    sectionTitle: {
      fontSize: 15,
      fontFamily: Fonts.semiBold,
      color: colors.textPrimary,
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
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
      color: colors.textMuted,
    },
    description: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    resolvedAt: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: colors.brand,
    },
  });
}
