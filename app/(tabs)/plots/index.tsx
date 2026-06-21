import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { searchFarmers } from "../../../src/api/farmers";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import type { FarmerSearchResult } from "../../../src/types";
import { Fonts } from "../../../src/theme/fonts";

const GREEN = "#1B6B3A";

export default function PlotsIndexScreen() {
  const router = useRouter();
  const { isOnline } = useSyncStatusStore();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FarmerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim() || !isOnline) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const data = await searchFarmers(text.trim());
        setResults(data);
      } catch {
        setSearchError("No se pudo buscar. Verifica la conexión.");
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }

  function handleSelect(farmer: FarmerSearchResult) {
    if (!farmer.farm?.farmId) return;
    const farmName = farmer.farm.name;
    router.push({
      pathname: "/(tabs)/plots/farm/[farmId]",
      params: { farmId: farmer.farm.farmId, farmName },
    });
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Lotes</Text>
      </View>

      {!isOnline ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            Sin conexión — la búsqueda de agricultores requiere conexión a internet.
          </Text>
        </View>
      ) : null}

      <View style={styles.body}>
        <Text style={styles.label}>Busca un agricultor para ver o capturar lotes de su finca</Text>

        <TextInput
          style={[styles.searchInput, !isOnline && styles.searchInputDisabled]}
          placeholder="Nombre o número de documento"
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={handleQueryChange}
          editable={isOnline}
          returnKeyType="search"
        />

        {isSearching ? (
          <ActivityIndicator size="small" color={GREEN} style={styles.spinner} />
        ) : null}

        {searchError ? (
          <Text style={styles.errorText}>{searchError}</Text>
        ) : null}

        {results.length > 0 ? (
          <FlatList
            data={results}
            keyExtractor={(item) => item.farmerId}
            style={styles.resultsList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <FarmerRow farmer={item} onPress={handleSelect} />}
          />
        ) : query.trim() && !isSearching ? (
          <Text style={styles.noResults}>Sin resultados para "{query}"</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function FarmerRow({
  farmer,
  onPress,
}: {
  farmer: FarmerSearchResult;
  onPress: (farmer: FarmerSearchResult) => void;
}) {
  const hasFarm = !!farmer.farm?.farmId;

  return (
    <Pressable
      style={[styles.resultItem, !hasFarm && styles.resultItemDisabled]}
      onPress={() => { if (hasFarm) onPress(farmer); }}
      disabled={!hasFarm}
    >
      <Text style={styles.resultName}>
        {farmer.name} {farmer.lastName ?? ""}
      </Text>
      {farmer.documentId ? (
        <Text style={styles.resultDetail}>Doc: {farmer.documentId}</Text>
      ) : null}
      {hasFarm ? (
        <Text style={styles.resultFarm}>Finca: {farmer.farm!.name}</Text>
      ) : (
        <Text style={styles.resultNoFarm}>Sin finca registrada</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: { fontSize: 17, fontFamily: Fonts.bold, color: "#111827" },

  offlineBanner: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
  },
  offlineText: { fontSize: 13, fontFamily: Fonts.regular, color: "#92400E" },

  body: {
    padding: 20,
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#6B7280",
  },
  searchInput: {
    height: 48,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: "#111827",
  },
  searchInputDisabled: {
    backgroundColor: "#F3F4F6",
    color: "#9CA3AF",
  },
  spinner: { alignSelf: "center" },
  errorText: { fontSize: 13, fontFamily: Fonts.regular, color: "#DC2626" },
  noResults: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 8,
  },
  resultsList: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    backgroundColor: "#fff",
    maxHeight: 320,
  },
  resultItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    gap: 2,
  },
  resultItemDisabled: { opacity: 0.5 },
  resultName: { fontFamily: Fonts.semiBold, fontSize: 14, color: "#111827" },
  resultDetail: { fontFamily: Fonts.regular, fontSize: 12, color: "#6B7280" },
  resultFarm: { fontFamily: Fonts.regular, fontSize: 12, color: GREEN },
  resultNoFarm: { fontFamily: Fonts.regular, fontSize: 12, color: "#EF4444" },
});
