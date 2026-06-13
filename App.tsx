import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
  JetBrainsMono_800ExtraBold,
} from "@expo-google-fonts/jetbrains-mono";
import * as SplashScreen from "expo-splash-screen";
import { useAuthStore } from "./src/store/useAuthStore";
import { runMigrations } from "./src/storage/db/db";
import LoginScreen from "./app/login";
import HomeScreen from "./app/index";

SplashScreen.preventAutoHideAsync();

export default function App() {
  const { user, isRestoring, restoreSession } = useAuthStore();
  const [dbReady, setDbReady] = useState(false);

  const [fontsLoaded] = useFonts({
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
    JetBrainsMono_800ExtraBold,
  });

  useEffect(() => {
    runMigrations()
      .then(() => {
        setDbReady(true);
        restoreSession();
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (fontsLoaded && !isRestoring && dbReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isRestoring, dbReady]);

  if (!fontsLoaded || isRestoring || !dbReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1B6B3A" />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <>
      {user ? <HomeScreen /> : <LoginScreen />}
      <StatusBar style={user ? "dark" : "light"} />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
});
