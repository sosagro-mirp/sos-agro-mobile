import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Check, CircleAlert, Clock, Paperclip } from "lucide-react-native";
import { AppText } from "./AppText";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import { resolveQueueStatus, type QueueStatusKind, type QueueStatusVisual } from "../../lib/queueStatus";

const ICON_BY_NAME = { Clock, Check, CircleAlert, Paperclip };

interface StatusBadgeProps {
  kind: QueueStatusKind;
  label: string;
  /** `sm` para insignias dentro de tarjetas densas; `md` para uso standalone. */
  size?: "sm" | "md";
}

/**
 * Insignia de estado de cola — spec 74, Fase 1. Usa siempre
 * `resolveQueueStatus` en vez de elegir color/ícono a mano: es el único punto
 * donde "pendiente / sincronizado / con error / adjunto" se traducen a
 * color+ícono en toda la app.
 */
export function StatusBadge({ kind, label, size = "sm" }: StatusBadgeProps) {
  const { colors } = useTheme();
  const visual = useMemo(() => resolveQueueStatus(kind, colors), [kind, colors]);
  const styles = useMemo(() => createStyles(visual, size), [visual, size]);
  const Icon = ICON_BY_NAME[visual.icon];

  return (
    <View style={styles.badge}>
      <Icon size={size === "sm" ? 12 : 14} color={visual.fg} />
      <AppText style={styles.label}>{label}</AppText>
    </View>
  );
}

function createStyles(visual: QueueStatusVisual, size: "sm" | "md") {
  return StyleSheet.create({
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: size === "sm" ? 5 : 6,
      alignSelf: "flex-start",
      backgroundColor: visual.bg,
      borderRadius: 99,
      paddingHorizontal: size === "sm" ? 9 : 10,
      paddingVertical: size === "sm" ? 4 : 5,
    },
    label: {
      fontFamily: Fonts.semiBold,
      fontSize: size === "sm" ? 10.5 : 11,
      color: visual.fg,
    },
  });
}
