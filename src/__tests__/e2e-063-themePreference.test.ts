/**
 * e2e-063 — Toggle global de tema claro/oscuro en la app móvil.
 *
 * Cubre los criterios de aceptación 9, 10, 11 y 12 de
 * `spec/63_toggle_global_tema_claro_oscuro.md` (raíz del ecosistema).
 *
 * ARRANCA EN ROJO: `src/theme/resolveTheme.ts`, `src/theme/colors.ts` y
 * `src/storage/themeStorage.ts` todavía no existen (Fase 5 del spec).
 *
 * NOTA DE DISEÑO — por qué se prueba lógica y no render: el proyecto no tiene
 * `@testing-library/react-native` ni `react-test-renderer` instalados y este
 * spec no agrega dependencias (criterio de aceptación 14). Por eso el
 * `ThemeProvider` delega toda su lógica en funciones puras (`resolveTheme`) y
 * en `themeStorage`, que es lo que se verifica aquí. El resultado visual se
 * valida en la ronda manual (`docs/testing/test-063-toggle-tema-global.md`).
 */

import {
  nextPreference,
  resolveEffectiveTheme,
  type ThemePreference,
} from "../theme/resolveTheme";
import { darkColors, getColors, lightColors } from "../theme/colors";
import { themeStorage } from "../storage/themeStorage";

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SecureStoreMock = require("expo-secure-store") as {
  __store: Map<string, string>;
};

beforeEach(() => {
  SecureStoreMock.__store.clear();
  jest.clearAllMocks();
});

describe("resolveEffectiveTheme — criterios de aceptación 9 y 11", () => {
  it("respeta la preferencia explícita por encima del tema del dispositivo", () => {
    expect(resolveEffectiveTheme("light", "dark")).toBe("light");
    expect(resolveEffectiveTheme("dark", "light")).toBe("dark");
  });

  it("sigue el esquema del dispositivo cuando la preferencia es 'system'", () => {
    expect(resolveEffectiveTheme("system", "dark")).toBe("dark");
    expect(resolveEffectiveTheme("system", "light")).toBe("light");
  });

  it("cae a claro cuando el dispositivo no reporta esquema (Appearance devuelve null)", () => {
    expect(resolveEffectiveTheme("system", null)).toBe("light");
  });
});

describe("nextPreference — ciclo del toggle (criterio de aceptación 9)", () => {
  it("cicla claro → oscuro → sistema → claro", () => {
    expect(nextPreference("light")).toBe("dark");
    expect(nextPreference("dark")).toBe("system");
    expect(nextPreference("system")).toBe("light");
  });
});

describe("themeStorage — persistencia entre arranques (criterio de aceptación 10)", () => {
  it("devuelve 'system' cuando no hay preferencia guardada", async () => {
    await expect(themeStorage.getPreference()).resolves.toBe("system");
  });

  it("guarda y recupera la preferencia elegida", async () => {
    await themeStorage.setPreference("dark");
    await expect(themeStorage.getPreference()).resolves.toBe("dark");
  });

  it("descarta valores corruptos y cae a 'system'", async () => {
    SecureStoreMock.__store.set("sosagro_theme_preference", "neon");
    await expect(themeStorage.getPreference()).resolves.toBe("system");
  });

  it("no propaga errores de lectura del almacenamiento seguro", async () => {
    const secureStore = require("expo-secure-store");
    secureStore.getItemAsync.mockRejectedValueOnce(new Error("keystore error"));
    await expect(themeStorage.getPreference()).resolves.toBe("system");
  });
});

describe("paleta por modo — criterios de aceptación 9 y 12", () => {
  it("getColors devuelve la paleta correspondiente al tema efectivo", () => {
    expect(getColors("light")).toEqual(lightColors);
    expect(getColors("dark")).toEqual(darkColors);
  });

  it("ambas paletas exponen exactamente las mismas claves semánticas", () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it("el acento brand es verde en claro y amarillo en oscuro", () => {
    // Verde institucional actual de la app (`#1B6B3A`, hoy hardcodeado).
    expect(lightColors.brand.toLowerCase()).toBe("#1b6b3a");
    // En oscuro el brand pasa a la familia amarilla (ver DESIGN.md → Modo oscuro).
    expect(darkColors.brand.toLowerCase()).toMatch(/^#(fde047|facc15|fbbf24)$/);
  });

  it("el texto sobre el brand se invierte para conservar contraste", () => {
    expect(lightColors.brandForeground.toLowerCase()).toBe("#ffffff");
    expect(darkColors.brandForeground.toLowerCase()).not.toBe("#ffffff");
  });

  it("los estados semánticos siguen siendo distintos del brand en oscuro", () => {
    // El amarillo de advertencia (sin conexión) no debe colisionar con el
    // amarillo de marca: son tokens distintos en ambos modos.
    expect(darkColors.warningFg).not.toBe(darkColors.brand);
    expect(darkColors.successFg).not.toBe(darkColors.brand);
    expect(darkColors.dangerFg).not.toBe(darkColors.brand);
  });

  it("no quedan claves con el mismo valor en ambos modos para fondo y texto", () => {
    expect(darkColors.background).not.toBe(lightColors.background);
    expect(darkColors.textPrimary).not.toBe(lightColors.textPrimary);
  });
});

describe("tipos de preferencia", () => {
  it("solo admite los tres estados definidos", () => {
    const valid: ThemePreference[] = ["light", "dark", "system"];
    valid.forEach((p) => {
      expect(["light", "dark"]).toContain(resolveEffectiveTheme(p, "light"));
    });
  });
});
