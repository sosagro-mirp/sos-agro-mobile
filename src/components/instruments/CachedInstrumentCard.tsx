import React from "react";
import { Pressable, View, Text, StyleSheet } from "react-native";
import { InstrumentResponse } from "../../types";
import { Fonts } from "../../theme/fonts";

interface CachedInstrumentCardProps {
  instrument: InstrumentResponse;
  onPress: () => void;
}

export const CachedInstrumentCard: React.FC<CachedInstrumentCardProps> = ({
  instrument,
  onPress,
}) => {
  const totalQuestions = instrument.sections.reduce(
    (sum, section) => sum + section.questions.length,
    0
  );
  const sectionCount = instrument.sections.length;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={2}>
          {instrument.name}
        </Text>
        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>v{instrument.version}</Text>
        </View>
      </View>
      <View style={styles.meta}>
        <Text style={styles.metaText}>
          {sectionCount} {sectionCount === 1 ? "sección" : "secciones"}
        </Text>
        <Text style={styles.metaSeparator}>·</Text>
        <Text style={styles.metaText}>
          {totalQuestions} {totalQuestions === 1 ? "pregunta" : "preguntas"}
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 16,
  },
  cardPressed: {
    opacity: 0.75,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  name: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: "#111827",
    flex: 1,
    lineHeight: 24,
  },
  versionBadge: {
    backgroundColor: "#EFF6FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  versionText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: "#1D4ED8",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: "#6B7280",
  },
  metaSeparator: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: "#9CA3AF",
  },
});
