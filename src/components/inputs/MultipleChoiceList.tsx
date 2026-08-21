import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import type { InstrumentDraftAnswer, InstrumentOption } from "../../types/instrument";
import { OPTION_SEARCH_THRESHOLD, normalizeSearchText } from "../../lib/optionSearch";

interface Props {
  questionId: string;
  options: InstrumentOption[];
  selectedIds: string[];
  otherText: string | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
  searchThreshold?: number;
}

export function MultipleChoiceList({
  questionId,
  options,
  selectedIds,
  otherText,
  onChange,
  searchThreshold = OPTION_SEARCH_THRESHOLD,
}: Props): React.JSX.Element {
  const [otherFocused, setOtherFocused] = useState(false);
  const [query, setQuery] = useState("");
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isSearchable = options.length > searchThreshold;

  const visibleOptions = useMemo(() => {
    if (!isSearchable || !query.trim()) return options;
    const normalizedQuery = normalizeSearchText(query);
    return options.filter(
      (option) => option.isOther || normalizeSearchText(option.text).includes(normalizedQuery),
    );
  }, [isSearchable, options, query]);

  const hasMatches = visibleOptions.some((option) => !option.isOther);
  const selectedOptions = useMemo(
    () => options.filter((option) => selectedIds.includes(option.optionId)),
    [options, selectedIds],
  );

  function handleToggle(option: InstrumentOption): void {
    const isSelected = selectedIds.includes(option.optionId);
    let newIds: string[];
    if (isSelected) {
      newIds = selectedIds.filter((id) => id !== option.optionId);
    } else {
      newIds = [...selectedIds, option.optionId];
    }

    const hasOtherSelected = options
      .filter((o) => o.isOther)
      .some((o) => newIds.includes(o.optionId));

    onChange({
      questionId,
      optionIds: newIds,
      otherText: hasOtherSelected ? (otherText ?? "") : undefined,
    });
  }

  function handleOtherText(text: string): void {
    onChange({ questionId, optionIds: selectedIds, otherText: text });
  }

  function renderOption(option: InstrumentOption): React.JSX.Element {
    const selected = selectedIds.includes(option.optionId);
    const showOtherInput = option.isOther === true && selected;
    return (
      <View>
        <TouchableOpacity
          style={[styles.row, selected && styles.rowSelected]}
          onPress={() => handleToggle(option)}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
        >
          <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
            {selected && <Text style={styles.checkmark}>✓</Text>}
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
            placeholderTextColor={colors.textMuted}
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
      {isSearchable && selectedOptions.length > 0 && (
        <View style={styles.chipsRow}>
          {selectedOptions.map((option) => (
            <TouchableOpacity
              key={option.optionId}
              style={styles.chip}
              onPress={() => handleToggle(option)}
              activeOpacity={0.7}
            >
              <Text style={styles.chipText} numberOfLines={1}>
                {option.text}
              </Text>
              <Text style={styles.chipRemove}>×</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {isSearchable && (
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar opción..."
          placeholderTextColor={colors.textMuted}
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      borderRadius: 12,
      paddingHorizontal: 16,
      height: 52,
    },
    noResults: {
      fontFamily: Fonts.regular,
      fontSize: 15,
      color: colors.textMuted,
      paddingHorizontal: 4,
    },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      maxWidth: "100%",
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.brand,
      backgroundColor: colors.brandSubtleBg,
    },
    chipText: {
      fontFamily: Fonts.regular,
      fontSize: 14,
      color: colors.brandHover,
      flexShrink: 1,
    },
    chipRemove: {
      fontFamily: Fonts.bold,
      fontSize: 14,
      color: colors.brand,
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
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      borderRadius: 12,
      gap: 14,
    },
    rowSelected: {
      borderLeftWidth: 4,
      borderLeftColor: colors.brand,
      borderColor: colors.brand,
      backgroundColor: colors.brandSubtleBg,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.textMuted,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    checkboxSelected: {
      borderColor: colors.brand,
      backgroundColor: colors.brand,
    },
    checkmark: {
      color: colors.brandForeground,
      fontSize: 14,
      fontFamily: Fonts.bold,
      lineHeight: 18,
    },
    label: {
      fontFamily: Fonts.regular,
      fontSize: 18,
      lineHeight: 24,
      color: colors.textPrimary,
      flex: 1,
    },
    labelSelected: {
      fontFamily: Fonts.semiBold,
      color: colors.brandHover,
    },
    otherInput: {
      fontFamily: Fonts.regular,
      fontSize: 18,
      lineHeight: 26,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      minHeight: 72,
      marginTop: 4,
    },
    otherInputFocused: {
      borderColor: colors.brand,
    },
  });
}
