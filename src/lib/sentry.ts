// Sentry is loaded lazily only when EXPO_PUBLIC_SENTRY_DSN is set.
// Static import of @sentry/react-native registers native view managers
// that crash in Expo Go, so we skip the import entirely when not configured.

export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native');
    Sentry.init({
      dsn,
      environment: __DEV__ ? 'development' : 'production',
      tracesSampleRate: __DEV__ ? 0 : 0.2,
      enableNativeNagger: false,
    });
  } catch {
    // Native module unavailable — ignore
  }
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = require('@sentry/react-native');
    Sentry.withScope((scope: { setExtras: (e: Record<string, unknown>) => void }) => {
      // Spec 80: adjunta el update en curso al contexto del evento. Sin esto,
      // un crash provocado por un bundle publicado por OTA es indistinguible
      // de uno del bundle embebido — y no se puede atribuir a la publicación
      // concreta que lo introdujo. `require` diferido para evitar el ciclo de
      // módulos con `otaUpdates.ts` (que a su vez importa `captureError`).
      let otaExtras: Record<string, unknown> = {};
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getOtaStatus } = require('./otaUpdates');
        const ota = getOtaStatus();
        otaExtras = {
          ota_updateId: ota.updateId,
          ota_channel: ota.channel,
          ota_isEmbeddedLaunch: ota.isEmbeddedLaunch,
        };
      } catch {
        // noop — no dejar que el contexto de OTA rompa el reporte del error real
      }
      scope.setExtras({ ...context, ...otaExtras });
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
  } catch {
    // noop
  }
}
