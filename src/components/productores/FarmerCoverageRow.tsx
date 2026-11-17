import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { AppText } from "../common/AppText";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import { summarizeProductorCoverage, type CoverageListRow } from "../../lib/productorFilters";

export function FarmerCoverageRow({ row, onPress }: { row: CoverageListRow; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 14,
          marginBottom: 10,
        },
        body: { flex: 1, minWidth: 0 },
        name: { fontFamily: Fonts.bold, fontSize: 15, color: colors.textPrimary },
        meta: { fontFamily: Fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
        tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
        tag: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
        tagText: { fontFamily: Fonts.semiBold, fontSize: 10.5 },
        count: { fontFamily: Fonts.extraBold, fontSize: 14, color: colors.textPrimary },
      }),
    [colors],
  );
  const s = summarizeProductorCoverage(row);
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Productor ${row.name}, ${s.label} instrumentos aplicados`}
    >
      <View style={styles.body}>
        <AppText style={styles.name} numberOfLines={1}>
          {row.name}
        </AppText>
        <AppText style={styles.meta} numberOfLines={1}>
          {row.documentId ? `Doc. ${row.documentId}` : "Sin documento"}
        </AppText>
        <View style={styles.tags}>
          {s.pending > 0 ? (
            <View style={[styles.tag, { backgroundColor: colors.warningBg }]}>
              <AppText style={[styles.tagText, { color: colors.warningFg }]}>{s.pending} pendientes</AppText>
            </View>
          ) : null}
          {row.warnings.includes("sin_finca") ? (
            <View style={[styles.tag, { backgroundColor: colors.dangerBg }]}>
              <AppText style={[styles.tagText, { color: colors.dangerFg }]}>Sin finca</AppText>
            </View>
          ) : null}
          {row.isProvisional ? (
            <View style={[styles.tag, { backgroundColor: colors.infoBg }]}>
              <AppText style={[styles.tagText, { color: colors.infoFg }]}>Provisional</AppText>
            </View>
          ) : null}
        </View>
      </View>
      <AppText style={styles.count}>{s.label}</AppText>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}
