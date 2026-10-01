import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight, User } from "lucide-react-native";
import { AppText } from "../common/AppText";
import { StatusBadge } from "../common/StatusBadge";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import type { CompletedSurveyListItem, CompletedSurveySubmissionStatus } from "../../lib/mergeCompletedSurveys";

const BADGE: Record<CompletedSurveySubmissionStatus, { kind: "pending" | "synced" | "failed"; label: string }> = {
  pending: { kind: "pending", label: "Pendiente de envío" },
  sent: { kind: "synced", label: "Enviada" },
  failed: { kind: "failed", label: "Error de envío" },
};

export function formatCompletedDate(item: Pick<CompletedSurveyListItem, "date" | "dateSource">): string {
  const formatted = new Date(item.date).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
  // D6: lo que viene solo del servidor muestra la fecha de recepción, no la de aplicación.
  return item.dateSource === "server" ? `Recibida el ${formatted}` : formatted;
}

interface Props {
  item: CompletedSurveyListItem;
  onPress: () => void;
}

export function CompletedSurveyCard({ item, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const badge = BADGE[item.submissionStatus];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Ver detalle de la encuesta de ${item.farmerName ?? "productor no disponible"}`}
    >
      <View style={styles.body}>
        <AppText style={styles.instrument} numberOfLines={2}>
          {item.instrumentName ?? "Instrumento no disponible"}
        </AppText>
        <View style={styles.farmerRow}>
          <User size={13} color={colors.textMuted} strokeWidth={2.2} />
          <AppText style={styles.farmer} numberOfLines={1}>
            {item.farmerName ?? "Productor no disponible"}
          </AppText>
        </View>
        <AppText style={styles.meta}>
          {item.responseCount} respuesta{item.responseCount !== 1 ? "s" : ""} · {formatCompletedDate(item)}
        </AppText>
        <StatusBadge kind={badge.kind} label={badge.label} />
      </View>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      minHeight: 48,
    },
    pressed: { opacity: 0.7 },
    body: { flex: 1, minWidth: 0, gap: 6 },
    instrument: { fontSize: 13.5, fontFamily: Fonts.bold, color: colors.textPrimary, lineHeight: 18 },
    farmerRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    farmer: { flex: 1, fontSize: 11.5, fontFamily: Fonts.regular, color: colors.textMuted },
    meta: { fontSize: 11, fontFamily: Fonts.regular, color: colors.textMuted },
  });
}
