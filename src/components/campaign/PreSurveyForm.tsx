import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ChevronRight, Info, Plus, Search, X } from "lucide-react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import { searchFarmers } from "../../api/farmers";
import { farmerCacheStorage } from "../../storage/farmerCache";
import { getInitials } from "../../lib/getInitials";
import { EmptyState } from "../common/EmptyState";
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

  const trimmedQuery = query.trim();
  const showNewFarmerOption = trimmedQuery.length > 0 && !isSearching && results.length === 0;
  const showInitialEmpty = trimmedQuery.length === 0;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>¿Quién es el encuestado?</Text>

      <View style={styles.searchRow}>
        <Search size={18} color={colors.brand} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Nombre o número de documento"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
        />
        {trimmedQuery.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Limpiar búsqueda">
            <X size={17} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {!isOnline ? (
        <View style={styles.offlineHint}>
          <Info size={15} color={colors.infoFg} style={styles.offlineHintIcon} />
          <Text style={styles.offlineHintText}>
            Buscando en agricultores guardados localmente
          </Text>
        </View>
      ) : null}

      {isSearching ? (
        <ActivityIndicator size="small" color={colors.brand} style={styles.searchSpinner} />
      ) : null}

      {searchError ? (
        <Text style={styles.searchError}>{searchError}</Text>
      ) : null}

      {showInitialEmpty ? (
        <EmptyState
          icon={Search}
          title="Empezá a escribir"
          description="Mostramos hasta 5 coincidencias por nombre o documento."
        />
      ) : null}

      {results.length > 0 ? (
        <>
          <Text style={styles.resultsCount}>
            {results.length} COINCIDENCIA{results.length !== 1 ? "S" : ""}
          </Text>
          <View style={styles.resultsList}>
            {results.slice(0, 5).map((item, index) => (
              <Pressable
                key={item.farmerId ?? `r-${index}`}
                style={styles.resultItem}
                onPress={() => handleSelect(item)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
                </View>
                <View style={styles.resultTextWrapper}>
                  <Text style={styles.resultName}>
                    {item.name}
                  </Text>
                  {item.documentId ? (
                    <Text style={styles.resultDetail}>Doc: {item.documentId}</Text>
                  ) : null}
                  {item.farm?.name ? (
                    <Text style={styles.resultDetail}>Finca: {item.farm.name}</Text>
                  ) : null}
                </View>
                <ChevronRight size={17} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {showNewFarmerOption ? (
        <Pressable style={styles.newFarmerCard} onPress={onNewFarmer}>
          <View style={styles.newFarmerIconWrapper}>
            <Plus size={20} color={colors.brandForeground} />
          </View>
          <View style={styles.newFarmerTextWrapper}>
            <Text style={styles.newFarmerText}>Nuevo encuestado</Text>
            {!isOnline ? (
              <Text style={styles.newFarmerDetail}>Los datos se sincronizarán al reconectar</Text>
            ) : null}
          </View>
        </Pressable>
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
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 48,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 2,
      borderColor: colors.brand,
      borderRadius: 11,
      paddingHorizontal: 13,
    },
    searchIcon: { flexShrink: 0 },
    searchInput: {
      flex: 1,
      fontFamily: Fonts.regular,
      fontSize: 15,
      color: colors.textPrimary,
      paddingVertical: 12,
    },
    offlineHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.infoBg,
      borderRadius: 9,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    offlineHintIcon: { flexShrink: 0 },
    offlineHintText: {
      fontFamily: Fonts.medium,
      fontSize: 11.5,
      color: colors.infoFg,
      flex: 1,
    },
    searchSpinner: {
      alignSelf: "center",
    },
    searchError: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: colors.dangerFg,
    },
    resultsCount: {
      fontFamily: Fonts.semiBold,
      fontSize: 10.5,
      color: colors.textMuted,
      letterSpacing: 0.5,
      marginTop: 4,
    },
    resultsList: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 11,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    resultItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 56,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: colors.brandSubtleBg,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    avatarText: {
      fontFamily: Fonts.bold,
      fontSize: 12.5,
      color: colors.brandSubtleFg,
    },
    resultTextWrapper: { flex: 1, minWidth: 0, gap: 2 },
    resultName: {
      fontFamily: Fonts.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    resultDetail: {
      fontFamily: Fonts.regular,
      fontSize: 11,
      color: colors.textMuted,
    },
    newFarmerCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 48,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.brand,
      borderRadius: 12,
      backgroundColor: colors.brandSubtleBg,
      padding: 14,
    },
    newFarmerIconWrapper: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    newFarmerTextWrapper: { flex: 1, minWidth: 0, gap: 3 },
    newFarmerText: {
      fontFamily: Fonts.bold,
      fontSize: 14,
      color: colors.brandSubtleFg,
    },
    newFarmerDetail: {
      fontFamily: Fonts.regular,
      fontSize: 11,
      color: colors.brandSubtleFg,
      opacity: 0.85,
      lineHeight: 15,
    },
  });
}
