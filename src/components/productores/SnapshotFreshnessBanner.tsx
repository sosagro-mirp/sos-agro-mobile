import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "../common/AppText";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";

export function formatSnapshotDate(iso: string): string {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

// «Cobertura al {fecha}» — la foto envejece sin conexión (DM4, riesgos del spec).
export function SnapshotFreshnessBanner({ computedAt }: { computedAt: string | null }) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        box: {
          paddingHorizontal: 16,
          paddingVertical: 6,
          backgroundColor: computedAt ? colors.infoBg : colors.warningBg,
        },
        text: { fontFamily: Fonts.medium, fontSize: 11.5, color: computedAt ? colors.infoFg : colors.warningFg },
      }),
    [colors, computedAt],
  );
  return (
    <View style={styles.box}>
      <AppText style={styles.text}>
        {computedAt
          ? `Cobertura al ${formatSnapshotDate(computedAt)}`
          : 'Sin cobertura descargada. Toca "Actualizar" con conexión.'}
      </AppText>
    </View>
  );
}
