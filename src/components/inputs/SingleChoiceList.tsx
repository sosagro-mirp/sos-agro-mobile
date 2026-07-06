import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import type { InstrumentDraftAnswer, InstrumentOption } from "../../types/instrument";
import { OPTION_SEARCH_THRESHOLD, normalizeSearchText } from "../../lib/optionSearch";

interface Props {
  questionId: string;
  options: InstrumentOption[];
  value: string | undefined;
  otherText?: string;
  booleanValue?: boolean;
  onChange: (answer: InstrumentDraftAnswer) => void;
  searchThreshold?: number;
}

export function SingleChoiceList({
  questionId,
  options,
  value,
  otherText,
  onChange,
  searchThreshold = OPTION_SEARCH_THRESHOLD,
}: Props): React.JSX.Element {
  const [otherFocused, setOtherFocused] = useState(false);
  const [query, setQuery] = useState("");
  const isSearchable = options.length > searchThreshold;

  const visibleOptions = useMemo(() => {
    if (!isSearchable || !query.trim()) return options;
    const normalizedQuery = normalizeSearchText(query);
    const matches = options.filter(
      (option) => option.isOther || normalizeSearchText(option.text).includes(normalizedQuery),
    );
    // Conserva visible la opción ya seleccionada aunque no coincida con la
    // búsqueda, para no perder de vista la respuesta ya dada al refinar.
    if (value && !matches.some((o) => o.optionId === value)) {
      const selected = options.find((o) => o.optionId === value);
      if (selected) return [selected, ...matches];
    }
    return matches;
  }, [isSearchable, options, query, value]);

  const hasMatches = visibleOptions.some((option) => !option.isOther);

  function handlePress(option: InstrumentOption): void {
    if (option.isOther) {
      onChange({ questionId, optionId: option.optionId, otherText: otherText ?? "" });
    } else {
      onChange({ questionId, optionId: option.optionId, otherText: undefined });
    }
  }

  function handleOtherText(text: string): void {
    onChange({ questionId, optionId: value, otherText: text });
  }

  function renderOption(option: InstrumentOption): React.JSX.Element {
    const selected = value === option.optionId;
    const showOtherInput = option.isOther === true && selected;
    return (
      <View>
        <TouchableOpacity
          style={[styles.row, selected && styles.rowSelected]}
          onPress={() => handlePress(option)}
          activeOpacity={0.7}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected }}
        >
          <View style={[styles.radio, selected && styles.radioSelected]}>
            {selected && <View style={styles.radioDot} />}
          </View>
          <Text style={[styles.label, selected && styles.labelSelected]}>
            {option.text}
          </Text>
        </TouchableOpacity>
        {showOtherInput && (
          <TextInput
            style={[styles.otherInput, otherFocused && styles.otherInputFocused]}
            value={otherText ?? ""}
            onChangeText={handleOtherText}
            onFocus={() => setOtherFocused(true)}
            onBlur={() => setOtherFocused(false)}
            placeholder="Especifica aquí..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, isSearchable && styles.containerFill]}>
      {isSearchable && (
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar opción..."
          placeholderTextColor="#9CA3AF"
          returnKeyType="search"
          autoCapitalize="none"
        />
      )}
      {isSearchable && !hasMatches && (
        <Text style={styles.noResults}>
          Sin resultados{options.some((o) => o.isOther) ? ". Puedes usar la opción \"Otros\"." : "."}
        </Text>
      )}
      {isSearchable ? (
        <FlatList
          data={visibleOptions}
          keyExtractor={(option) => option.optionId}
          renderItem={({ item }) => renderOption(item)}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          style={styles.virtualizedList}
          contentContainerStyle={styles.virtualizedListContent}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={7}
          removeClippedSubviews
        />
      ) : (
        visibleOptions.map((option) => (
          <View key={option.optionId}>{renderOption(option)}</View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: 8,
  },
  containerFill: {
    flex: 1,
  },
  searchInput: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
  },
  noResults: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: "#6B7280",
    paddingHorizontal: 4,
  },
  virtualizedList: {
    flex: 1,
  },
  virtualizedListContent: {
    paddingBottom: 8,
  },
  separator: {
    height: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    gap: 14,
  },
  rowSelected: {
    borderLeftWidth: 4,
    borderLeftColor: "#1B6B3A",
    borderColor: "#1B6B3A",
    backgroundColor: "#F0FDF4",
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: "#1B6B3A",
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#1B6B3A",
  },
  label: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    lineHeight: 24,
    color: "#374151",
    flex: 1,
  },
  labelSelected: {
    fontFamily: Fonts.semiBold,
    color: "#14532D",
  },
  otherInput: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    lineHeight: 26,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 72,
    marginTop: 4,
  },
  otherInputFocused: {
    borderColor: "#1B6B3A",
  },
});
