import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Bloque de carga con animación de opacidad — spec 74, Fase 1 (deuda #5).
 * Ciclo de 1.4 s (0.5 → 1 → 0.5), igual que el mockup. Reemplaza el texto
 * plano "Cargando…" y los `ActivityIndicator` sueltos en pantallas de lista.
 */
export function Skeleton({ width = "100%", height = 14, borderRadius = 4, style }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: colors.skeleton, opacity },
        style,
      ]}
    />
  );
}

/**
 * Skeleton de tarjeta de lista (campañas, borradores, lotes): título, dos
 * líneas de descripción y una fila de badges — mismo esqueleto que hoy solo
 * existe para el listado de campañas, generalizado para las demás pantallas.
 */
export function SkeletonCard() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <Skeleton width="72%" height={14} style={styles.title} />
      <Skeleton width="94%" height={11} style={styles.line} />
      <Skeleton width="58%" height={11} style={styles.lineLast} />
      <View style={styles.row}>
        <Skeleton width={96} height={22} borderRadius={99} />
        <Skeleton width={70} height={22} borderRadius={99} />
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 16,
    },
    title: { marginBottom: 10 },
    line: { marginBottom: 6 },
    lineLast: { marginBottom: 14 },
    row: { flexDirection: "row", gap: 8 },
  });
}
