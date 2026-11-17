import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "../common/AppText";
import { PrimaryButton } from "../common/PrimaryButton";
import { SecondaryButton } from "../common/SecondaryButton";
import { CoverageStatusChip, type ChipKind } from "./CoverageStatusChip";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import { blockedNotice, type ApplyTarget } from "../../lib/applyTargets";

const LEVEL_TITLES = {
  farmer: "Productor",
  farm: "Fincas",
  farm_crop: "Cultivos",
} as const;

function chipFor(t: ApplyTarget): ChipKind {
  if (t.localStatus) return t.localStatus;
  return t.status;
}

interface Props {
  targets: ApplyTarget[];
  onApply: (t: ApplyTarget) => void;
  onReapply: (t: ApplyTarget) => void;
}

// Cobertura agrupada por nivel; dentro de cada nivel los pendientes primero
// (listApplyTargets ya ordena por acción).
export function CoverageUnitList({ targets, onApply, onReapply }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        group: { marginBottom: 18 },
        groupTitle: { fontFamily: Fonts.extraBold, fontSize: 13, color: colors.textMuted, marginBottom: 8 },
        item: {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 12,
          marginBottom: 8,
          gap: 6,
        },
        instrument: { fontFamily: Fonts.bold, fontSize: 14, color: colors.textPrimary },
        label: { fontFamily: Fonts.regular, fontSize: 12, color: colors.textMuted },
        notice: { fontFamily: Fonts.medium, fontSize: 12, color: colors.warningFg },
        empty: { fontFamily: Fonts.regular, fontSize: 13, color: colors.textMuted },
      }),
    [colors],
  );

  if (targets.length === 0) {
    return <AppText style={styles.empty}>Este productor no tiene instrumentos aplicables.</AppText>;
  }

  return (
    <View>
      {(["farmer", "farm", "farm_crop"] as const).map((level) => {
        const items = targets.filter((t) => t.scopeLevel === level);
        if (items.length === 0) return null;
        return (
          <View key={level} style={styles.group}>
            <AppText style={styles.groupTitle}>{LEVEL_TITLES[level].toUpperCase()}</AppText>
            {items.map((t, i) => (
              <View key={`${t.instrumentId}:${t.farmId ?? ""}:${t.farmCropId ?? ""}:${i}`} style={styles.item}>
                <AppText style={styles.instrument}>{t.instrumentName}</AppText>
                {t.label !== t.instrumentName ? <AppText style={styles.label}>{t.label}</AppText> : null}
                <CoverageStatusChip kind={chipFor(t)} />
                {t.coveredByOtherFarmer ? (
                  <AppText style={styles.label}>Cubierto por otro productor de la misma finca</AppText>
                ) : null}
                {t.action === "none" && t.blockedReason ? (
                  <AppText style={styles.notice}>{blockedNotice(t.blockedReason)}</AppText>
                ) : null}
                {t.action === "apply" ? <PrimaryButton label="Aplicar" onPress={() => onApply(t)} /> : null}
                {t.action === "reapply" ? (
                  <SecondaryButton label="Aplicar de nuevo" onPress={() => onReapply(t)} />
                ) : null}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
