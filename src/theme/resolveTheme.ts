export type ThemePreference = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";
export type DeviceColorScheme = "light" | "dark" | null;

const PREFERENCE_CYCLE: ThemePreference[] = ["light", "dark", "system"];

export function resolveEffectiveTheme(
  preference: ThemePreference,
  deviceScheme: DeviceColorScheme
): EffectiveTheme {
  if (preference !== "system") return preference;
  return deviceScheme === "dark" ? "dark" : "light";
}

export function nextPreference(preference: ThemePreference): ThemePreference {
  const index = PREFERENCE_CYCLE.indexOf(preference);
  return PREFERENCE_CYCLE[(index + 1) % PREFERENCE_CYCLE.length];
}
