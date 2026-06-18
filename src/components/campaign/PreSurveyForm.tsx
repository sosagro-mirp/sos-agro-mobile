import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Fonts } from "../../theme/fonts";
import { searchFarmers } from "../../api/farmers";
import type { FarmerSearchResult, LastFarmerResult } from "../../types";

interface PreSurveyFormProps {
  lastFarmer: LastFarmerResult;
  isOnline: boolean;
  onSearchSelect: (farmerId: string, farmerName: string) => void;
  onNewFarmer: () => void;
  onContinueLast: (farmerId: string, farmerName: string) => void;
}

export const PreSurveyForm: React.FC<PreSurveyFormProps> = ({
  lastFarmer,
  isOnline,
  onSearchSelect,
  onNewFarmer,
  onContinueLast,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FarmerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || !isOnline) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const data = await searchFarmers(query.trim());
        setResults(data);
      } catch {
        setSearchError("No se pudo buscar. Verifica la conexión.");
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOnline]);

  const handleSelect = (farmer: FarmerSearchResult) => {
    const fullName = [farmer.name, farmer.lastName].filter(Boolean).join(" ");
    onSearchSelect(farmer.farmerId, fullName);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>¿Quién es el encuestado?</Text>

      {/* Search section */}
      {!searchOpen ? (
        <Pressable
          style={[styles.actionButton, !isOnline && styles.actionButtonDisabled]}
          onPress={() => { if (isOnline) setSearchOpen(true); }}
          disabled={!isOnline}
        >
          <Text style={styles.actionButtonText}>Buscar encuestado</Text>
        </Pressable>
      ) : (
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Nombre o número de documento"
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {isSearching ? (
            <ActivityIndicator size="small" color={GREEN} style={styles.searchSpinner} />
          ) : null}
          {searchError ? (
            <Text style={styles.searchError}>{searchError}</Text>
          ) : null}
          {results.length > 0 ? (
            <ScrollView
              style={styles.resultsList}
              keyboardShouldPersistTaps="handled"
            >
              {results.map((item) => (
                <Pressable
                  key={item.farmerId}
                  style={styles.resultItem}
                  onPress={() => handleSelect(item)}
                >
                  <Text style={styles.resultName}>
                    {item.name} {item.lastName ?? ""}
                  </Text>
                  {item.documentId ? (
                    <Text style={styles.resultDetail}>Doc: {item.documentId}</Text>
                  ) : null}
                  {item.farm?.name ? (
                    <Text style={styles.resultDetail}>Finca: {item.farm.name}</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          ) : query.trim() && !isSearching ? (
            <Text style={styles.noResults}>Sin resultados para "{query}"</Text>
          ) : null}
          <Pressable onPress={() => { setSearchOpen(false); setQuery(""); setResults([]); }}>
            <Text style={styles.cancelLink}>Cancelar búsqueda</Text>
          </Pressable>
        </View>
      )}

      {/* New farmer */}
      <Pressable
        style={[styles.actionButton, !isOnline && styles.actionButtonDisabled]}
        onPress={() => { if (isOnline) onNewFarmer(); }}
        disabled={!isOnline}
      >
        <Text style={styles.actionButtonText}>+ Nuevo encuestado</Text>
      </Pressable>

      {!isOnline ? (
        <Text style={styles.offlineHint}>
          Buscar y registrar encuestados requiere conexión.
        </Text>
      ) : null}

      {/* Continue with last farmer */}
      {lastFarmer ? (
        <Pressable
          style={[styles.actionButton, styles.actionButtonLast]}
          onPress={() => {
            const fullName = [lastFarmer.name, lastFarmer.lastName].filter(Boolean).join(" ");
            onContinueLast(lastFarmer.farmerId, fullName);
          }}
        >
          <Text style={[styles.actionButtonText, styles.actionButtonLastText]}>
            Continuar con {lastFarmer.name}
          </Text>
        </Pressable>
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
  actionButton: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
  },
  actionButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  actionButtonLast: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: GREEN,
  },
  actionButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: "#fff",
  },
  actionButtonLastText: {
    color: GREEN,
  },
  offlineHint: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  searchBox: {
    gap: 8,
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
    maxHeight: 220,
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
  noResults: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 8,
  },
  cancelLink: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 4,
  },
});
