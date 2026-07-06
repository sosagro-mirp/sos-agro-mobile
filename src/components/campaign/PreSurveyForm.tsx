import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Fonts } from "../../theme/fonts";
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
              farm: c.farmName ? { name: c.farmName } : null,
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
        placeholderTextColor="#9CA3AF"
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
        <ActivityIndicator size="small" color={GREEN} style={styles.searchSpinner} />
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

const GREEN = "#1B6B3A";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 12,
  },
  heading: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: "#111827",
    marginBottom: 4,
  },
  offlineSearchHint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#6B7280",
  },
  searchInput: {
    height: 48,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: "#111827",
  },
  searchSpinner: {
    alignSelf: "center",
  },
  searchError: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#DC2626",
  },
  resultsList: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  resultItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    gap: 2,
  },
  resultName: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: "#111827",
  },
  resultDetail: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#6B7280",
  },
  newFarmerItem: {
    borderBottomWidth: 0,
  },
  newFarmerText: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: GREEN,
  },
});
