import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuthStore } from "../src/store/useAuthStore";
import { Fonts } from "../src/theme/fonts";

export default function HomeScreen() {
  const { user, logout } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SOS Agro 4C</Text>
      <Text style={styles.welcome}>
        Bienvenido, {user?.name} {user?.lastName}
      </Text>
      <Text style={styles.role}>{user?.role ?? "sin rol"}</Text>

      <Pressable style={styles.button} onPress={logout}>
        <Text style={styles.buttonText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.extraBold,
    color: "#1B6B3A",
    marginBottom: 24,
  },
  welcome: {
    fontSize: 18,
    fontFamily: Fonts.semiBold,
    color: "#111827",
    textAlign: "center",
  },
  role: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#6B7280",
    marginTop: 6,
    marginBottom: 40,
    textTransform: "capitalize",
  },
  button: {
    borderWidth: 1.5,
    borderColor: "#1B6B3A",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  buttonText: {
    color: "#1B6B3A",
    fontSize: 15,
    fontFamily: Fonts.semiBold,
  },
});
