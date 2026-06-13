import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "./src/store/useAuthStore";
import LoginScreen from "./app/login";
import HomeScreen from "./app/index";

export default function App() {
  const { user, isRestoring, restoreSession } = useAuthStore();

  useEffect(() => {
    restoreSession();
  }, []);

  if (isRestoring) {
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
