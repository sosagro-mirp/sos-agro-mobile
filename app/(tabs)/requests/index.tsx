import { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Clock, MessageCircle, Check, type LucideIcon } from "lucide-react-native";
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

const STATUS_ICONS: Record<string, LucideIcon> = {
  pending_sync: Clock,
  open: MessageCircle,
  resolved: Check,
};

function getStatusColors(colors: ThemeColors): Record<string, { fg: string; bg: string }> {
  return {
    pending_sync: { fg: colors.warningFg, bg: colors.warningBg },
    open: { fg: colors.infoFg, bg: colors.infoBg },
    resolved: { fg: colors.successFg, bg: colors.successBg },
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
        <Text style={styles.title}>Solicitudes</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ChangeRequestForm />

        {requests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MIS SOLICITUDES</Text>
            {requests.map((r) => {
              const tone = statusColors[r.status] ?? { fg: colors.textMuted, bg: colors.surfaceMuted };
              const StatusIcon = STATUS_ICONS[r.status] ?? Clock;
              return (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
                      <StatusIcon size={11} color={tone.fg} strokeWidth={2.6} />
                      <Text style={[styles.statusBadgeText, { color: tone.fg }]}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Text>
                    </View>
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
              );
            })}
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
    title: { fontSize: 19, fontFamily: Fonts.extraBold, color: colors.textPrimary, letterSpacing: -0.3 },
    content: { padding: 14, gap: 22 },

    section: { gap: 11 },
    sectionTitle: {
      fontSize: 11.5,
      fontFamily: Fonts.extraBold,
      color: colors.textMuted,
      letterSpacing: 0.6,
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 13,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 9,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 99,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    statusBadgeText: { fontSize: 10, fontFamily: Fonts.extraBold },
    dateText: {
      fontSize: 10.5,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
    },
    description: {
      fontSize: 12.5,
      fontFamily: Fonts.regular,
      color: colors.textPrimary,
      lineHeight: 19,
    },
    resolvedAt: {
      fontSize: 11,
      fontFamily: Fonts.regular,
      color: colors.brand,
    },
  });
}
