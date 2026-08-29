import type { EffectiveTheme } from "./resolveTheme";
// Spec 76, Fase 2: `background` de ambos temas vive también en
// `splashBackground.js` (JS plano) porque `app.config.ts` no puede resolver
// imports relativos a este archivo `.ts` al evaluar el config plugin de
// `expo-splash-screen`. Se importa aquí para no hardcodear el mismo valor
// dos veces — un cambio de fondo se hace en un solo lugar.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const splashBackground = require("./splashBackground") as { light: string; dark: string };

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
  /** Chrome del header de la app (spec 74) — distinto de `brand`: en oscuro
   * deja de ser amarillo institucional para evitar el amarillo-sobre-amarillo
   * que obligó a derivar overlays especiales en el spec 63. */
  headerBg: string;
  headerFg: string;
  headerSub: string;
  headerPill: string;
  headerBorder: string;
  /** Fondo de los skeletons de carga (spec 74). */
  skeleton: string;
}

/** Verde institucional (#1B6B3A) — mismo valor que app.config.ts, ver DESIGN.md. */
export const lightColors: ThemeColors = {
  background: splashBackground.light,
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
  headerBg: "#1B6B3A",
  headerFg: "#FFFFFF",
  headerSub: "rgba(255,255,255,.72)",
  headerPill: "rgba(255,255,255,.16)",
  headerBorder: "rgba(255,255,255,.32)",
  skeleton: "#EFF1F4",
};

/** Verde → amarillo en oscuro, mismo criterio que la web (spec 63). */
export const darkColors: ThemeColors = {
  background: splashBackground.dark,
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
  // Spec 74, decisión 10: en oscuro el header deja de ser el amarillo de
  // marca y pasa a surfaceMuted con borde — elimina el amarillo sobre
  // amarillo y los overlays derivados que el spec 63 tuvo que inventar.
  headerBg: "#1E293B",
  headerFg: "#F1F5F9",
  headerSub: "#94A3B8",
  headerPill: "rgba(241,245,249,.08)",
  headerBorder: "#334155",
  skeleton: "#1E293B",
};

export function getColors(theme: EffectiveTheme): ThemeColors {
  return theme === "dark" ? darkColors : lightColors;
}
