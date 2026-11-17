import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "../common/AppText";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";

// Spec 103 — estado de cobertura de una unidad o instrumento.
export type ChipKind = "aplicado" | "parcial" | "falta" | "aplicado_local" | "en_curso";

const LABELS: Record<ChipKind, string> = {
  aplicado: "Aplicado",
  parcial: "Parcial",
  falta: "Falta",
  aplicado_local: "Aplicado en este dispositivo",
  en_curso: "En curso",
};

export function CoverageStatusChip({ kind }: { kind: ChipKind }) {
  const { colors } = useTheme();
  const palette = useMemo(() => {
    if (kind === "aplicado" || kind === "aplicado_local") return { bg: colors.successBg, fg: colors.successFg };
    if (kind === "parcial" || kind === "en_curso") return { bg: colors.warningBg, fg: colors.warningFg };
    return { bg: colors.dangerBg, fg: colors.dangerFg };
  }, [kind, colors]);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          alignSelf: "flex-start",
          backgroundColor: palette.bg,
          borderRadius: 99,
          paddingHorizontal: 9,
          paddingVertical: 4,
        },
        label: { fontFamily: Fonts.semiBold, fontSize: 10.5, color: palette.fg },
      }),
    [palette],
  );
  return (
    <View style={styles.chip}>
      <AppText style={styles.label}>{LABELS[kind]}</AppText>
    </View>
  );
}
