import React, { useMemo } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { AppText } from "./AppText";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

export type ConfirmSheetTone = "warning" | "danger" | "info" | "brand";

export interface ConfirmSheetAction {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
}

interface ConfirmSheetProps {
  visible: boolean;
  /** Ícono dentro del contenedor de 44 px del encabezado. */
  icon?: LucideIcon;
  tone?: ConfirmSheetTone;
  title: string;
  body: string;
  /** Camino seguro: botón sólido de acento, siempre arriba. */
  primaryAction?: ConfirmSheetAction;
  /** Camino neutro: botón con borde. */
  secondaryAction?: ConfirmSheetAction;
  /**
   * Acción destructiva — spec 74, jerarquía de acciones destructivas del
   * orquestador: separada por un divisor, en rojo sobre fondo rojo suave,
   * nunca el botón más prominente ni junto al camino seguro. El `label`
   * debe nombrar lo que se pierde en cantidad cuando aplique (ej.
   * "Sobrescribir las 64 respuestas"), no queda implícito acá.
   */
  destructiveAction?: ConfirmSheetAction;
  isLoading?: boolean;
  onRequestClose: () => void;
}

/**
 * Bottom sheet de confirmación compartido — spec 74, Fase 1. Reemplaza los
 * modales propios de duplicado/colisión de documento (Fase 6) y los
 * `Alert.alert()` de decisión que hoy quedan sueltos por la app (deuda #1).
 * Esta fase solo lo crea: nadie lo usa todavía.
 */
export function ConfirmSheet({
  visible,
  icon: HeaderIcon,
  tone = "warning",
  title,
  body,
  primaryAction,
  secondaryAction,
  destructiveAction,
  isLoading = false,
  onRequestClose,
}: ConfirmSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toneColors = useMemo(() => resolveTone(colors, tone), [colors, tone]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            {HeaderIcon ? (
              <View style={[styles.iconWrapper, { backgroundColor: toneColors.bg }]}>
                <HeaderIcon size={22} color={toneColors.fg} />
              </View>
            ) : null}
            <View style={styles.headerText}>
              <AppText style={styles.title}>{title}</AppText>
              <AppText style={styles.body}>{body}</AppText>
            </View>
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" color={colors.brand} style={styles.spinner} />
          ) : (
            <View style={styles.actions}>
              {primaryAction ? (
                <SheetAction action={primaryAction} variant="primary" colors={colors} styles={styles} />
              ) : null}
              {secondaryAction ? (
                <SheetAction action={secondaryAction} variant="secondary" colors={colors} styles={styles} />
              ) : null}
              {destructiveAction ? (
                <>
                  <View style={styles.divider} />
                  <SheetAction action={destructiveAction} variant="destructive" colors={colors} styles={styles} />
                </>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

type SheetActionVariant = "primary" | "secondary" | "destructive";

function SheetAction({
  action,
  variant,
  colors,
  styles,
}: {
  action: ConfirmSheetAction;
  variant: SheetActionVariant;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const ActionIcon = action.icon;
  const iconColor =
    variant === "primary" ? colors.brandForeground : variant === "destructive" ? colors.dangerFg : colors.textPrimary;

  return (
    <Pressable
      style={[
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "destructive" && styles.buttonDestructive,
      ]}
      onPress={action.onPress}
      accessibilityRole="button"
    >
      {ActionIcon ? <ActionIcon size={variant === "destructive" ? 17 : 18} color={iconColor} /> : null}
      <AppText
        style={[
          styles.buttonLabel,
          variant === "primary" && styles.buttonLabelPrimary,
          variant === "secondary" && styles.buttonLabelSecondary,
          variant === "destructive" && styles.buttonLabelDestructive,
        ]}
      >
        {action.label}
      </AppText>
    </Pressable>
  );
}

function resolveTone(colors: ThemeColors, tone: ConfirmSheetTone) {
  switch (tone) {
    case "danger":
      return { bg: colors.dangerBg, fg: colors.dangerFg };
    case "info":
      return { bg: colors.infoBg, fg: colors.infoFg };
    case "brand":
      return { bg: colors.brandSubtleBg, fg: colors.brandSubtleFg };
    case "warning":
    default:
      return { bg: colors.warningBg, fg: colors.warningFg };
  }
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 12,
      paddingHorizontal: 18,
      paddingBottom: 20,
    },
    handle: {
      alignSelf: "center",
      width: 38,
      height: 4,
      borderRadius: 99,
      backgroundColor: colors.borderStrong,
      marginBottom: 20,
    },
    header: {
      flexDirection: "row",
      gap: 13,
      marginBottom: 20,
    },
    iconWrapper: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    headerText: { flex: 1, minWidth: 0 },
    title: {
      fontSize: 16.5,
      fontFamily: Fonts.bold,
      color: colors.textPrimary,
      lineHeight: 21,
      marginBottom: 7,
    },
    body: {
      fontSize: 12.5,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      lineHeight: 19,
    },
    spinner: { marginVertical: 16 },
    actions: { gap: 10 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      minHeight: 48,
      borderRadius: 11,
      paddingHorizontal: 16,
    },
    buttonPrimary: { backgroundColor: colors.brand },
    buttonSecondary: { borderWidth: 1, borderColor: colors.borderStrong },
    buttonDestructive: { borderWidth: 1, borderColor: colors.dangerFg, backgroundColor: colors.dangerBg },
    buttonLabel: { fontFamily: Fonts.semiBold, fontSize: 15 },
    buttonLabelPrimary: { color: colors.brandForeground },
    buttonLabelSecondary: { color: colors.textPrimary },
    buttonLabelDestructive: { color: colors.dangerFg, fontSize: 13.5 },
  });
}
