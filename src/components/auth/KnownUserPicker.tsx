import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../common/AppText";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import { getInitials } from "../../lib/getInitials";
import { formatAvailableUntil, type KnownUserView } from "../../hooks/useKnownUsers";

interface Props {
  users: KnownUserView[];
  selectedUserId: string | null;
  onSelect: (view: KnownUserView) => void;
}

/** Spec 86 (D9): tarjetas de "¿Quién va a encuestar?" con su estado sin conexión. */
export function KnownUserPicker({ users, selectedUserId, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.list}>
      {users.map((view) => {
        const { user } = view;
        const selected = user.userId === selectedUserId;
        const fullName = `${user.name} ${user.lastName}`.trim();
        // El estado nunca se comunica solo con color: siempre va el texto.
        const tag =
          view.blockedReason === null && view.availableUntil
            ? `Disponible sin conexión hasta ${formatAvailableUntil(view.availableUntil)}`
            : view.blockedReason === 'locked'
              ? "Bloqueado por intentos fallidos"
              : "Requiere conexión";
        return (
          <Pressable
            key={user.userId}
            style={[styles.card, selected && styles.cardSelected]}
            onPress={() => onSelect(view)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${fullName}. ${tag}`}
          >
            <View style={styles.avatar}>
              <AppText style={styles.avatarText}>{getInitials(fullName || user.email)}</AppText>
            </View>
            <View style={styles.info}>
              <AppText style={styles.name} numberOfLines={1}>{fullName || user.email}</AppText>
              <AppText style={styles.email} numberOfLines={1}>{user.email}</AppText>
              <AppText
                style={[styles.tag, view.blockedReason !== null && styles.tagBlocked]}
                numberOfLines={2}
              >
                {tag}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: { gap: 10, marginBottom: 14 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 64,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    cardSelected: { borderColor: colors.brand, backgroundColor: colors.brandSubtleBg },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
    },
    avatarText: { fontFamily: Fonts.bold, fontSize: 15, color: colors.brandForeground },
    info: { flex: 1 },
    name: { fontFamily: Fonts.semiBold, fontSize: 15, color: colors.textPrimary },
    email: { fontFamily: Fonts.regular, fontSize: 12.5, color: colors.textMuted },
    tag: { fontFamily: Fonts.medium, fontSize: 12, color: colors.successFg, marginTop: 3 },
    tagBlocked: { color: colors.warningFg },
  });
}
