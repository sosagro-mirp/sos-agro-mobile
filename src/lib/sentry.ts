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
      if (context) scope.setExtras(context);
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
  } catch {
    // noop
  }
}
