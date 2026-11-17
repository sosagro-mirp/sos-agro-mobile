import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus, RefreshCw, Search, SlidersHorizontal, Users } from "lucide-react-native";
import { useCachedCampaignsStore } from "../../../src/store/useCachedCampaignsStore";
import { useSyncStatusStore } from "../../../src/store/useSyncStatusStore";
import { runMigrations } from "../../../src/storage/db/db";
import { coverageCacheStorage } from "../../../src/storage/coverageCache";
import { applyProductorFilters, type CoverageListRow, type ProductorFilters } from "../../../src/lib/productorFilters";
import { resolveDownloadPhases } from "../../../src/lib/resolveDownloadPhases";
import { AppText } from "../../../src/components/common/AppText";
import { EmptyState } from "../../../src/components/common/EmptyState";
import { OfflineNotice } from "../../../src/components/common/OfflineNotice";
import { FarmerCoverageRow } from "../../../src/components/productores/FarmerCoverageRow";
import { SnapshotFreshnessBanner } from "../../../src/components/productores/SnapshotFreshnessBanner";
import { Fonts } from "../../../src/theme/fonts";
import { useTheme } from "../../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../../src/theme/colors";

type Options = Awaited<ReturnType<typeof coverageCacheStorage.getFilterOptions>>;
const EMPTY_OPTIONS: Options = { departments: [], towns: [], crops: [], instruments: [] };

const STATUS_OPTIONS: { id: NonNullable<ProductorFilters["status"]>; name: string }[] = [
  { id: "con_pendientes", name: "Con pendientes" },
  { id: "completo", name: "Completos" },
  { id: "sin_finca", name: "Sin finca" },
];

export default function ProductoresScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isOnline } = useSyncStatusStore();
  const { isLoading, refresh, loadFromCache, snapshotComputedAt, downloadProgress, error } =
    useCachedCampaignsStore();

  const [rows, setRows] = useState<CoverageListRow[]>([]);
  const [options, setOptions] = useState<Options>(EMPTY_OPTIONS);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<ProductorFilters>({});

  const load = useCallback(async () => {
    try {
      await runMigrations();
    } catch {
      // las migraciones ya corrieron en _layout.tsx
    }
    await loadFromCache();
    const [list, opts] = await Promise.all([coverageCacheStorage.list(), coverageCacheStorage.getFilterOptions()]);
    setRows(list);
    setOptions(opts);
  }, [loadFromCache]);

  // Se recarga al volver de una ficha: la superposición local cambia al aplicar.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible = useMemo(() => applyProductorFilters(rows, { ...filters, search }), [rows, filters, search]);
  const refreshDisabled = !isOnline || isLoading;
  const phases = useMemo(() => resolveDownloadPhases(downloadProgress), [downloadProgress]);
  const currentPhase = phases.find((p) => p.status === "current");
  const activeFilters = Object.entries(filters).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : !!v)).length;

  const doRefresh = async () => {
    if (refreshDisabled) return;
    try {
      await refresh();
    } catch {
      // el error queda en el store y se muestra abajo
    }
    await load();
  };

  const setList = (key: "departmentIds" | "townIds" | "cropIds", id: string) =>
    setFilters((f) => ({ ...f, [key]: f[key]?.[0] === id ? undefined : [id] }));

  return (
    <SafeAreaView style={styles.root} edges={[]}>
      <View style={styles.header}>
        <AppText style={styles.title} numberOfLines={1}>
          Productores
        </AppText>
        <Pressable
          style={styles.btn}
          onPress={() => router.push("/productores/nuevo")}
          accessibilityLabel="Registrar productor nuevo"
        >
          <Plus size={15} color={colors.textPrimary} />
          <AppText style={styles.btnText}>Nuevo</AppText>
        </Pressable>
        <Pressable
          style={[styles.btn, refreshDisabled && styles.btnDisabled]}
          onPress={doRefresh}
          disabled={refreshDisabled}
          accessibilityLabel="Actualizar productores y cobertura"
        >
          <RefreshCw size={15} color={refreshDisabled ? colors.textMuted : colors.textPrimary} />
          <AppText style={styles.btnText}>Actualizar</AppText>
        </Pressable>
      </View>

      <SnapshotFreshnessBanner computedAt={snapshotComputedAt} />

      {currentPhase ? (
        <View style={styles.progress}>
          <AppText style={styles.progressText} numberOfLines={1}>
            {currentPhase.currentName ?? currentPhase.label} ({currentPhase.percent}%)
          </AppText>
        </View>
      ) : null}
      {error ? (
        <View style={styles.errorBox}>
          <AppText style={styles.errorText}>{error}</AppText>
        </View>
      ) : null}
      {!isOnline && !downloadProgress ? (
        <View style={styles.offline}>
          <OfflineNotice message="Sin conexión. Trabajas con la cobertura descargada; lo aplicado aquí se suma al sincronizar." />
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nombre o documento"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            accessibilityLabel="Buscar productor"
          />
        </View>
        <Pressable
          style={[styles.filterBtn, activeFilters > 0 && styles.filterBtnActive]}
          onPress={() => setShowFilters((v) => !v)}
          accessibilityLabel="Filtros"
        >
          <SlidersHorizontal size={16} color={activeFilters > 0 ? colors.brandForeground : colors.textPrimary} />
          {activeFilters > 0 ? <AppText style={styles.filterCount}>{activeFilters}</AppText> : null}
        </Pressable>
      </View>

      {showFilters ? (
        <View style={styles.filters}>
          <ChipRow
            title="Estado"
            options={STATUS_OPTIONS}
            selected={filters.status ?? null}
            onSelect={(id) => setFilters((f) => ({ ...f, status: f.status === id ? null : (id as ProductorFilters["status"]) }))}
            styles={styles}
          />
          <ChipRow
            title="Le falta"
            options={options.instruments}
            selected={filters.missingInstrumentId ?? null}
            onSelect={(id) => setFilters((f) => ({ ...f, missingInstrumentId: f.missingInstrumentId === id ? null : id }))}
            styles={styles}
          />
          <ChipRow title="Departamento" options={options.departments} selected={filters.departmentIds?.[0] ?? null} onSelect={(id) => setList("departmentIds", id)} styles={styles} />
          <ChipRow title="Municipio" options={options.towns} selected={filters.townIds?.[0] ?? null} onSelect={(id) => setList("townIds", id)} styles={styles} />
          <ChipRow title="Cultivo" options={options.crops} selected={filters.cropIds?.[0] ?? null} onSelect={(id) => setList("cropIds", id)} styles={styles} />
          {activeFilters > 0 ? (
            <Pressable onPress={() => setFilters({})}>
              <AppText style={styles.clear}>Limpiar filtros</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isLoading && !downloadProgress}
            enabled={!refreshDisabled}
            onRefresh={() => void doRefresh()}
            tintColor={colors.brand}
          />
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sin productores descargados"
            description={
              isOnline
                ? 'Toca "Actualizar" para descargar los productores y su cobertura.'
                : 'Conéctate y toca "Actualizar" para descargar los productores.'
            }
            actionLabel={isOnline ? "Actualizar" : undefined}
            onAction={isOnline ? () => void doRefresh() : undefined}
          />
        ) : visible.length === 0 ? (
          <EmptyState icon={Search} title="Sin resultados" description="Ningún productor coincide con la búsqueda o los filtros." />
        ) : (
          visible.map((row) => (
            <FarmerCoverageRow key={row.farmerId} row={row} onPress={() => router.push(`/productores/${row.farmerId}`)} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ChipRow({
  title,
  options,
  selected,
  onSelect,
  styles,
}: {
  title: string;
  options: { id: string; name: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  if (options.length === 0) return null;
  return (
    <View style={styles.chipBlock}>
      <AppText style={styles.chipTitle}>{title}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {options.map((o) => (
          <Pressable key={o.id} onPress={() => onSelect(o.id)} style={[styles.chip, selected === o.id && styles.chipActive]}>
            <AppText style={[styles.chipText, selected === o.id && styles.chipTextActive]} numberOfLines={1}>
              {o.name}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surfaceMuted },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
    title: { fontFamily: Fonts.extraBold, fontSize: 20, color: colors.textPrimary, flexShrink: 1 },
    btn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    btnDisabled: { opacity: 0.5 },
    btnText: { fontFamily: Fonts.semiBold, fontSize: 12.5, color: colors.textPrimary },
    progress: { paddingHorizontal: 16, paddingVertical: 6 },
    progressText: { fontFamily: Fonts.medium, fontSize: 12, color: colors.textMuted },
    errorBox: { marginHorizontal: 16, marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: colors.dangerBg },
    errorText: { fontFamily: Fonts.medium, fontSize: 12, color: colors.dangerFg },
    offline: { paddingHorizontal: 16, paddingTop: 8 },
    searchRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10 },
    searchBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12 },
    searchInput: { flex: 1, paddingVertical: 10, fontFamily: Fonts.regular, fontSize: 14, color: colors.textPrimary },
    filterBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, justifyContent: "center" },
    filterBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    filterCount: { fontFamily: Fonts.bold, fontSize: 12, color: colors.brandForeground },
    filters: { paddingHorizontal: 16, paddingTop: 10, gap: 8 },
    chipBlock: { gap: 4 },
    chipTitle: { fontFamily: Fonts.semiBold, fontSize: 11.5, color: colors.textMuted },
    chipRow: { gap: 6 },
    chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 220 },
    chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    chipText: { fontFamily: Fonts.medium, fontSize: 12, color: colors.textPrimary },
    chipTextActive: { color: colors.brandForeground },
    clear: { fontFamily: Fonts.semiBold, fontSize: 12, color: colors.brand, textDecorationLine: "underline" },
    list: { padding: 16 },
  });
}
