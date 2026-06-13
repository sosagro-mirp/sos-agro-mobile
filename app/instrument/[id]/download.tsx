import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCachedInstrumentsStore } from "../../../src/store/useCachedInstrumentsStore";
import { Fonts } from "../../../src/theme/fonts";

export default function InstrumentDownloadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { downloadAndCache, error } = useCachedInstrumentsStore();

  useEffect(() => {
    downloadAndCache(id)
      .then(() => router.replace(`/instrument/${id}/start`))
      .catch(() => {
        // error is shown via store state
      });
  }, [id]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <>
            <ActivityIndicator size="large" color="#1B6B3A" />
            <Text style={styles.label}>Descargando instrumento…</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  label: { fontSize: 15, fontFamily: Fonts.regular, color: "#6B7280" },
  error: { fontSize: 15, fontFamily: Fonts.regular, color: "#DC2626", textAlign: "center", paddingHorizontal: 32 },
});
