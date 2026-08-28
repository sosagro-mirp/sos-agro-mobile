// Spec 76, Fase 2: valores compartidos entre `app.config.ts` (config plugin
// de expo-splash-screen) y `src/theme/colors.ts` (fondo real de la app).
//
// `app.config.ts` se evalúa con un `require()` simple, sin el pipeline de
// TypeScript del proyecto: no puede resolver imports relativos a otros
// archivos `.ts` (`Cannot find module './src/theme/colors'`). Este archivo
// es JavaScript plano, sin sintaxis TS, para que ambos lados lo puedan leer
// sin duplicar los valores a mano.
//
// Si cambia el fondo institucional, actualizar aquí Y `background` en
// `lightColors`/`darkColors` de `colors.ts` — son la misma fuente lógica,
// repartida en dos archivos por esta limitación de carga del config.
module.exports = {
  light: "#FFFFFF",
  dark: "#0F172A",
};
