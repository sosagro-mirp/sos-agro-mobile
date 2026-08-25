import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Search, Info } from "lucide-react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isSearchable = options.length > searchThreshold;
  const hasOtherOption = options.some((o) => o.isOther);
  const countableTotal = options.filter((o) => !o.isOther).length;

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

  const countableVisible = visibleOptions.filter((o) => !o.isOther).length;
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

  function renderOption(option: InstrumentOption, isLast: boolean): React.JSX.Element {
    const selected = value === option.optionId;
    const showOtherInput = option.isOther === true && selected;
    return (
      <View>
        <TouchableOpacity
          style={[
            styles.row,
            !isLast && styles.rowDivider,
            selected && styles.rowSelected,
          ]}
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
      {isSearchable && (
        <View style={styles.searchWrapper}>
          <Search size={17} color={colors.textMuted} strokeWidth={2.4} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar opción..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            autoCapitalize="none"
          />
        </View>
      )}
      {isSearchable && (
        <Text style={styles.counter}>
          {countableVisible} de {countableTotal} opciones
        </Text>
      )}
      {isSearchable && !hasMatches && (
        <Text style={styles.noResults}>
          Sin resultados{hasOtherOption ? ". Puedes usar la opción \"Otros\"." : "."}
        </Text>
      )}
      {isSearchable ? (
        <FlatList
          data={visibleOptions}
          keyExtractor={(option) => option.optionId}
          renderItem={({ item, index }) => renderOption(item, index === visibleOptions.length - 1)}
          style={[styles.virtualizedList, styles.optionsBox]}
          contentContainerStyle={styles.virtualizedListContent}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={7}
          removeClippedSubviews
        />
      ) : (
        <View style={styles.optionsBox}>
          {visibleOptions.map((option, index) => (
            <View key={option.optionId}>
              {renderOption(option, index === visibleOptions.length - 1)}
            </View>
          ))}
        </View>
      )}
      {isSearchable && hasOtherOption && (
        <View style={styles.infoBanner}>
          <Info size={15} color={colors.infoFg} strokeWidth={2.2} />
          <Text style={styles.infoBannerText}>
            Si no está en la lista, usá la opción «Otros» al final.
          </Text>
        </View>
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
    searchWrapper: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 13,
    },
    searchInput: {
      flex: 1,
      fontFamily: Fonts.regular,
      fontSize: 14,
      color: colors.textPrimary,
      minHeight: 48,
    },
    counter: {
      fontFamily: Fonts.regular,
      fontSize: 10.5,
      color: colors.textMuted,
    },
    noResults: {
      fontFamily: Fonts.regular,
      fontSize: 15,
      color: colors.textMuted,
      paddingHorizontal: 4,
    },
    optionsBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 11,
      overflow: "hidden",
    },
    virtualizedList: {
      flex: 1,
    },
    virtualizedListContent: {
      flexGrow: 1,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 56,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      gap: 12,
    },
    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowSelected: {
      backgroundColor: colors.brandSubtleBg,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.textMuted,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    radioSelected: {
      borderColor: colors.brand,
    },
    radioDot: {
      width: 11,
      height: 11,
      borderRadius: 6,
      backgroundColor: colors.brand,
    },
    label: {
      fontFamily: Fonts.medium,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textPrimary,
      flex: 1,
    },
    labelSelected: {
      fontFamily: Fonts.bold,
      color: colors.brandSubtleFg,
    },
    otherInput: {
      fontFamily: Fonts.regular,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 64,
      margin: 10,
      marginTop: 0,
    },
    otherInputFocused: {
      borderColor: colors.brand,
    },
    infoBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.infoBg,
      borderRadius: 9,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    infoBannerText: {
      flex: 1,
      fontFamily: Fonts.semiBold,
      fontSize: 11.5,
      lineHeight: 16,
      color: colors.infoFg,
    },
  });
}
