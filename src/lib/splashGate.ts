/**
 * Spec 76, Fase 3 — decisión de cuándo ocultar el splash.
 *
 * Se extrae como función pura para poder probarla: el componente `SplashGate`
 * de `app/_layout.tsx` no es testeable (el proyecto no tiene renderer de React
 * Native), pero la regla que aplica sí.
 *
 * Contexto: el splash lo retiene deliberadamente `SplashGate` hasta que fuentes,
 * base de datos, sesión y tema estén listos — así se evita el parpadeo
 * claro→oscuro sin desmontar el árbol, que es lo que provocó el bucle infinito
 * de remontaje del 2026-08-18. El riesgo del diseño es el opuesto: si una de
 * esas dependencias nunca resuelve (por ejemplo `runMigrations()` rechaza y
 * `dbReady` se queda en false), el splash no se oculta jamás y la app queda
 * indistinguible de un cuelgue. El tope de tiempo es la red de seguridad.
 */

/** Tope duro: pasado este tiempo el splash se oculta aunque falte algo. */
export const SPLASH_TIMEOUT_MS = 10_000;

export interface SplashGateState {
  /** Fuentes, base de datos y restauración de sesión completadas. */
  ready: boolean;
  /** La preferencia de tema ya se leyó de storage. */
  restored: boolean;
  /** Milisegundos transcurridos desde que se montó el gate. */
  elapsedMs: number;
}

export function shouldHideSplash({ ready, restored, elapsedMs }: SplashGateState): boolean {
  if (ready && restored) return true;
  return elapsedMs >= SPLASH_TIMEOUT_MS;
}

/**
 * Qué dependencias seguían pendientes al vencer el tope. Se usa solo para el
 * reporte a Sentry: sin esto, un splash ocultado por tope no dejaría ninguna
 * pista de qué se quedó colgado.
 */
export function pendingSplashDependencies(deps: {
  fontsLoaded: boolean;
  dbReady: boolean;
  isRestoring: boolean;
  restored: boolean;
}): string[] {
  const pending: string[] = [];
  if (!deps.fontsLoaded) pending.push('fonts');
  if (!deps.dbReady) pending.push('database');
  if (deps.isRestoring) pending.push('session');
  if (!deps.restored) pending.push('theme');
  return pending;
}
