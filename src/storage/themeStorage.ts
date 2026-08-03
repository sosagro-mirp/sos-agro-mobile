import * as SecureStore from "expo-secure-store";
import type { ThemePreference } from "../theme/resolveTheme";

const THEME_PREFERENCE_KEY = "sosagro_theme_preference";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export const themeStorage = {
  async getPreference(): Promise<ThemePreference> {
    try {
      const stored = await SecureStore.getItemAsync(THEME_PREFERENCE_KEY);
      return isThemePreference(stored) ? stored : "system";
    } catch {
      return "system";
    }
  },

  setPreference: (preference: ThemePreference) =>
    SecureStore.setItemAsync(THEME_PREFERENCE_KEY, preference),
};
