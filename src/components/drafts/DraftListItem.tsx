import React from "react";
import { Pressable, View, Text, StyleSheet } from "react-native";
import { SurveyDraft } from "../../storage/surveyDraftStore";
import { Fonts } from "../../theme/fonts";

interface DraftListItemProps {
  draft: SurveyDraft;
  onPress: () => void;
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

export const DraftListItem: React.FC<DraftListItemProps> = ({
  draft,
  onPress,
}) => {
  const answerCount = Object.keys(draft.answers).length;
  const formattedDate = draft.updatedAt.toLocaleString();
  const truncatedInstrumentId = truncate(draft.instrumentId, 20);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.content}>
        <Text style={styles.instrumentId} numberOfLines={1}>
          {truncatedInstrumentId}
        </Text>
        <Text style={styles.answerCount}>
          {answerCount} {answerCount === 1 ? "respuesta" : "respuestas"}
        </Text>
        <Text style={styles.date}>{formattedDate}</Text>
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
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.75,
  },
  content: {
    gap: 4,
  },
  instrumentId: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: "#111827",
  },
  answerCount: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: "#6B7280",
  },
  date: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 2,
  },
});
