import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ClipboardCheck, Search, SearchX, WifiOff } from "lucide-react-native";
import { useCompletedSurveys } from "../../../src/hooks/useCompletedSurveys";
import { CompletedSurveyCard } from "../../../src/components/completed/CompletedSurveyCard";
import { AppText } from "../../../src/components/common/AppText";
import { EmptyState } from "../../../src/components/common/EmptyState";
import { SkeletonCard } from "../../../src/components/common/Skeleton";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";
import type { CompletedSurveyListItem } from "../../../src/lib/mergeCompletedSurveys";

const SEARCH_DEBOUNCE_MS = 400;

export default function CompletedSurveysScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { items, mode, degraded, isLoading, isRefreshing, isLoadingMore, reload, refresh, loadMore } =
    useCompletedSurveys(search);

  // El hook ya carga al montar y al cambiar la búsqueda; el foco solo recarga
  // al volver a la pestaña (p. ej. tras enviar una encuesta).
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void reload({ refresh: true });
    }, [reload]),
  );

  const openDetail = (item: CompletedSurveyListItem) => {
    router.push({
      pathname: "/completed/[id]",
      params: {
        id: item.clientSurveyId ?? item.surveyId ?? item.key,
        source: item.clientSurveyId ? "local" : "remote",
        ...(item.surveyId ? { surveyId: item.surveyId } : {}),
        instrumentName: item.instrumentName ?? "",
        farmerName: item.farmerName ?? "",
        date: item.date,
        dateSource: item.dateSource,
      },
    });
  };

  const showSkeleton = isLoading && items.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={[]}>
      <View style={styles.header}>
        <AppText style={styles.title}>Encuestas realizadas</AppText>
        <AppText style={styles.subtitle}>
          {showSkeleton
            ? " "
            : `${items.length} encuesta${items.length !== 1 ? "s" : ""}${mode === "local" ? " en este dispositivo" : ""}`}
        </AppText>
        <View style={styles.searchBox}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Productor o documento"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Buscar por productor o documento"
          />
        </View>
      </View>

      {degraded ? (
        <View style={styles.notice}>
          <WifiOff size={16} color={colors.warningFg} />
          <AppText style={styles.noticeText}>
            Sin conexión — mostrando solo las encuestas guardadas en este dispositivo
          </AppText>
          <Pressable onPress={() => void reload()} hitSlop={8} accessibilityRole="button">
            <AppText style={styles.noticeAction}>Reintentar</AppText>
          </Pressable>
        </View>
      ) : null}

      {showSkeleton ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => <CompletedSurveyCard item={item} onPress={() => openDetail(item)} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} tintColor={colors.brand} />
          }
          ListEmptyComponent={
            search ? (
              <EmptyState
                icon={SearchX}
                title="Sin resultados"
                description="Ninguna encuesta coincide con esa búsqueda."
              />
            ) : (
              <EmptyState
                icon={ClipboardCheck}
                title="Aún no has aplicado encuestas"
                description="Las encuestas que termines aparecerán aquí para consultarlas."
              />
            )
          }
          ListFooterComponent={isLoadingMore ? <SkeletonCard /> : null}
        />
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 3,
    },
    title: { fontSize: 19, fontFamily: Fonts.extraBold, color: colors.textPrimary, letterSpacing: -0.3 },
    subtitle: { fontSize: 11.5, fontFamily: Fonts.regular, color: colors.textMuted },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 10,
      minHeight: 48,
      paddingHorizontal: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceMuted,
    },
    searchInput: { flex: 1, fontSize: 14, fontFamily: Fonts.regular, color: colors.textPrimary, paddingVertical: 8 },
    notice: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: colors.warningBg,
      borderBottomWidth: 1,
      borderBottomColor: colors.warningFg,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    noticeText: { flex: 1, fontSize: 12, fontFamily: Fonts.medium, color: colors.warningFg },
    noticeAction: {
      fontSize: 11.5,
      fontFamily: Fonts.bold,
      color: colors.warningFg,
      textDecorationLine: "underline",
    },
    list: { padding: 14, flexGrow: 1 },
  });
}
