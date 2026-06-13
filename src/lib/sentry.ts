import * as Sentry from '@sentry/react-native';

export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // not configured — skip
  try {
    Sentry.init({
      dsn,
      environment: __DEV__ ? 'development' : 'production',
      tracesSampleRate: __DEV__ ? 0 : 0.2,
      enableNativeNagger: false,
    });
  } catch {
    // Sentry unavailable (e.g., first Expo Go run without native module) — ignore
  }
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  try {
    Sentry.withScope((scope) => {
      if (context) scope.setExtras(context);
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
  } catch {
    // noop
  }
}
