// Spec 76, Fase 2: valores compartidos entre `app.config.ts` (config plugin
// de expo-splash-screen) y `src/theme/colors.ts` (fondo real de la app).
//
// `app.config.ts` se evalúa con un `require()` simple, sin el pipeline de
// TypeScript del proyecto: no puede resolver imports relativos a otros
// archivos `.ts` (`Cannot find module './src/theme/colors'`). Este archivo
// es JavaScript plano, sin sintaxis TS, para que ambos lados lo puedan leer
// sin duplicar los valores a mano.
//
// Este archivo es la única fuente real de los dos valores: `colors.ts` ya
// lee `background` de aquí (`require("./splashBackground")`), así que
// cambiar el fondo institucional se hace **solo en este archivo** — no hay
// un segundo lugar que actualizar a mano.
module.exports = {
  light: "#FFFFFF",
  dark: "#0F172A",
};
