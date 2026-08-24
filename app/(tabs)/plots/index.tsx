import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { searchFarmers } from "../../../src/api/farmers";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import type { FarmerSearchResult } from "../../../src/types";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";

export default function PlotsIndexScreen() {
  const router = useRouter();
  const { isOnline } = useSyncStatusStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
    <SafeAreaView style={styles.root} edges={[]}>
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
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={handleQueryChange}
          editable={isOnline}
          returnKeyType="search"
        />

        {isSearching ? (
          <ActivityIndicator size="small" color={colors.brand} style={styles.spinner} />
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
          <Text style={styles.noResults}>Sin resultados para &quot;{query}&quot;</Text>
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hasFarm = !!farmer.farm?.farmId;

  return (
    <Pressable
      style={[styles.resultItem, !hasFarm && styles.resultItemDisabled]}
      onPress={() => { if (hasFarm) onPress(farmer); }}
      disabled={!hasFarm}
    >
      <Text style={styles.resultName}>{farmer.name}</Text>
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: { fontSize: 17, fontFamily: Fonts.bold, color: colors.textPrimary },

    offlineBanner: {
      backgroundColor: colors.warningBg,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.warningFg,
    },
    offlineText: { fontSize: 13, fontFamily: Fonts.regular, color: colors.warningFg },

    body: {
      padding: 20,
      gap: 12,
    },
    label: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
    },
    searchInput: {
      height: 48,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      fontFamily: Fonts.regular,
      fontSize: 15,
      color: colors.textPrimary,
    },
    searchInputDisabled: {
      backgroundColor: colors.surfaceMuted,
      color: colors.textMuted,
    },
    spinner: { alignSelf: "center" },
    errorText: { fontSize: 13, fontFamily: Fonts.regular, color: colors.dangerFg },
    noResults: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: colors.textMuted,
      textAlign: "center",
      paddingVertical: 8,
    },
    resultsList: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.surface,
      maxHeight: 320,
    },
    resultItem: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 2,
    },
    resultItemDisabled: { opacity: 0.5 },
    resultName: { fontFamily: Fonts.semiBold, fontSize: 14, color: colors.textPrimary },
    resultDetail: { fontFamily: Fonts.regular, fontSize: 12, color: colors.textMuted },
    resultFarm: { fontFamily: Fonts.regular, fontSize: 12, color: colors.brand },
    resultNoFarm: { fontFamily: Fonts.regular, fontSize: 12, color: colors.dangerFg },
  });
}
