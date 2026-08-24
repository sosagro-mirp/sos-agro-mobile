import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check, CircleAlert, Info } from "lucide-react-native";
import { AppText } from "./AppText";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

export type SnackbarVariant = "success" | "error" | "info";

const DEFAULT_DURATION_MS = 3000;
const ICON_BY_VARIANT = { success: Check, error: CircleAlert, info: Info };

interface SnackbarOptions {
  message: string;
  variant?: SnackbarVariant;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
  /**
   * Separación desde el borde inferior — spec 74, deuda #2: la snackbar se
   * ancla sobre el footer de navegación, nunca encima. El llamador conoce la
   * altura real de su propio footer; el default (0) asume que no hay footer
   * fijo debajo.
   */
  bottomOffset?: number;
}

interface SnackbarContextValue {
  show: (options: SnackbarOptions) => void;
  dismiss: () => void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

/**
 * Proveedor del sistema de mensajes efímeros — spec 74, Fase 1 (deuda #2).
 * Reemplaza los banners persistentes y los `Alert.alert()` de aviso (no de
 * decisión: eso es `ConfirmSheet`). Deliberadamente no se usa dentro de la
 * encuesta: ahí el feedback de guardado es el chip persistente, no un toast
 * por respuesta.
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<SnackbarOptions | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCurrent(null);
  }, []);

  const show = useCallback((options: SnackbarOptions) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCurrent(options);
    timerRef.current = setTimeout(() => {
      setCurrent(null);
    }, options.durationMs ?? DEFAULT_DURATION_MS);
  }, []);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <SnackbarHost current={current} onDismiss={dismiss} />
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): SnackbarContextValue {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error("useSnackbar debe usarse dentro de <SnackbarProvider>");
  }
  return context;
}

function SnackbarHost({
  current,
  onDismiss,
}: {
  current: SnackbarOptions | null;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!current) return null;

  const variant = current.variant ?? "info";
  const Icon = ICON_BY_VARIANT[variant];
  const tone = resolveVariantTone(colors, variant);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom: current.bottomOffset ?? 0 }]}
    >
      <View style={[styles.bar, { backgroundColor: tone.bg, borderColor: tone.fg }]}>
        <Icon size={16} color={tone.fg} />
        <AppText style={[styles.message, { color: tone.fg }]} numberOfLines={2}>
          {current.message}
        </AppText>
        {current.actionLabel && current.onAction ? (
          <Pressable
            onPress={() => {
              current.onAction?.();
              onDismiss();
            }}
            hitSlop={8}
          >
            <AppText style={[styles.action, { color: tone.fg }]}>{current.actionLabel}</AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function resolveVariantTone(colors: ThemeColors, variant: SnackbarVariant) {
  switch (variant) {
    case "success":
      return { bg: colors.successBg, fg: colors.successFg };
    case "error":
      return { bg: colors.dangerBg, fg: colors.dangerFg };
    case "info":
    default:
      return { bg: colors.infoBg, fg: colors.infoFg };
  }
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    host: {
      position: "absolute",
      left: 0,
      right: 0,
      paddingHorizontal: 14,
      paddingBottom: 14,
    },
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 11,
      borderWidth: 1,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    message: {
      flex: 1,
      fontFamily: Fonts.medium,
      fontSize: 13,
      lineHeight: 18,
    },
    action: {
      fontFamily: Fonts.bold,
      fontSize: 13,
      textDecorationLine: "underline",
    },
  });
}
