import type { EffectiveTheme } from "./resolveTheme";

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  textPrimary: string;
  textMuted: string;
  textInverse: string;
  border: string;
  borderStrong: string;
  brand: string;
  brandHover: string;
  brandForeground: string;
  brandSubtleBg: string;
  brandSubtleFg: string;
  successBg: string;
  successFg: string;
  dangerBg: string;
  dangerFg: string;
  warningBg: string;
  warningFg: string;
  infoBg: string;
  infoFg: string;
}

/** Verde institucional (#1B6B3A) — mismo valor que app.config.ts, ver DESIGN.md. */
export const lightColors: ThemeColors = {
  background: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceMuted: "#F9FAFB",
  textPrimary: "#111827",
  textMuted: "#6B7280",
  textInverse: "#F9FAFB",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  brand: "#1B6B3A",
  brandHover: "#14532D",
  brandForeground: "#FFFFFF",
  brandSubtleBg: "#F0FDF4",
  brandSubtleFg: "#1B6B3A",
  successBg: "#F0FDF4",
  successFg: "#16A34A",
  dangerBg: "#FEF2F2",
  dangerFg: "#DC2626",
  warningBg: "#FEF3C7",
  warningFg: "#92400E",
  infoBg: "#DBEAFE",
  infoFg: "#1D4ED8",
};

/** Verde → amarillo en oscuro, mismo criterio que la web (spec 63). */
export const darkColors: ThemeColors = {
  background: "#0F172A",
  surface: "#0F172A",
  surfaceMuted: "#1E293B",
  textPrimary: "#F1F5F9",
  textMuted: "#94A3B8",
  textInverse: "#0F172A",
  border: "#334155",
  borderStrong: "#64748B",
  brand: "#FDE047",
  brandHover: "#FACC15",
  brandForeground: "#0F172A",
  brandSubtleBg: "#422006",
  brandSubtleFg: "#FDE047",
  successBg: "#052E16",
  successFg: "#4ADE80",
  dangerBg: "#450A0A",
  dangerFg: "#F87171",
  warningBg: "#451A03",
  warningFg: "#FBBF24",
  infoBg: "#172554",
  infoFg: "#60A5FA",
};

export function getColors(theme: EffectiveTheme): ThemeColors {
  return theme === "dark" ? darkColors : lightColors;
}
