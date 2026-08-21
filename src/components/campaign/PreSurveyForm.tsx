import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import { searchFarmers } from "../../api/farmers";
import { farmerCacheStorage } from "../../storage/farmerCache";
import type { FarmerSearchResult } from "../../types";

interface PreSurveyFormProps {
  isOnline: boolean;
  onSearchSelect: (farmerId: string, farmerName: string, farmer?: FarmerSearchResult) => void;
  onNewFarmer: () => void;
}

export const PreSurveyForm: React.FC<PreSurveyFormProps> = ({
  isOnline,
  onSearchSelect,
  onNewFarmer,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FarmerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        if (isOnline) {
          const data = await searchFarmers(query.trim());
          setResults(data);
        } else {
          const cached = await farmerCacheStorage.search(query.trim());
          setResults(
            cached.map((c) => ({
              farmerId: c.farmerId,
              name: c.name,
              documentId: c.documentId ?? null,
              phone: c.phone ?? null,
              farm: c.farmName || (c.crops && c.crops.length > 0)
                ? { name: c.farmName ?? '', crops: c.crops ?? null }
                : null,
            }))
          );
        }
      } catch {
        if (isOnline) {
          setSearchError("No se pudo buscar. Verifica la conexión.");
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOnline]);

  const handleSelect = (farmer: FarmerSearchResult) => {
    onSearchSelect(farmer.farmerId, farmer.name, farmer);
  };

  const showNewFarmerOption = query.trim().length > 0 && !isSearching && results.length === 0;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>¿Quién es el encuestado?</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Nombre o número de documento"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        autoFocus
        returnKeyType="search"
      />

      {!isOnline ? (
        <Text style={styles.offlineSearchHint}>
          Buscando en agricultores guardados localmente
        </Text>
      ) : null}

      {isSearching ? (
        <ActivityIndicator size="small" color={colors.brand} style={styles.searchSpinner} />
      ) : null}

      {searchError ? (
        <Text style={styles.searchError}>{searchError}</Text>
      ) : null}

      {(results.length > 0 || showNewFarmerOption) ? (
        <View style={styles.resultsList}>
          {results.slice(0, 5).map((item, index) => (
            <Pressable
              key={item.farmerId ?? `r-${index}`}
              style={styles.resultItem}
              onPress={() => handleSelect(item)}
            >
              <Text style={styles.resultName}>
                {item.name}
              </Text>
              {item.documentId ? (
                <Text style={styles.resultDetail}>Doc: {item.documentId}</Text>
              ) : null}
              {item.farm?.name ? (
                <Text style={styles.resultDetail}>Finca: {item.farm.name}</Text>
              ) : null}
            </Pressable>
          ))}
          {showNewFarmerOption ? (
            <Pressable style={[styles.resultItem, styles.newFarmerItem]} onPress={onNewFarmer}>
              <Text style={styles.newFarmerText}>+ Nuevo encuestado</Text>
              {!isOnline ? (
                <Text style={styles.resultDetail}>Los datos se sincronizarán al reconectar</Text>
              ) : null}
            </Pressable>
          ) : null}
        </View>
      ) : null}

    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 24,
      gap: 12,
    },
    heading: {
      fontFamily: Fonts.bold,
      fontSize: 18,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    offlineSearchHint: {
      fontFamily: Fonts.regular,
      fontSize: 12,
      color: colors.textMuted,
    },
    searchInput: {
      height: 48,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      fontFamily: Fonts.regular,
      fontSize: 15,
      color: colors.textPrimary,
    },
    searchSpinner: {
      alignSelf: "center",
    },
    searchError: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: colors.dangerFg,
    },
    resultsList: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.surface,
    },
    resultItem: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceMuted,
      gap: 2,
    },
    resultName: {
      fontFamily: Fonts.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    resultDetail: {
      fontFamily: Fonts.regular,
      fontSize: 12,
      color: colors.textMuted,
    },
    newFarmerItem: {
      borderBottomWidth: 0,
    },
    newFarmerText: {
      fontFamily: Fonts.semiBold,
      fontSize: 14,
      color: colors.brand,
    },
  });
}
