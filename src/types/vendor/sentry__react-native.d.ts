declare module '@sentry/react-native' {
  interface SentryInitOptions {
    dsn: string;
    environment?: string;
    tracesSampleRate?: number;
    enableNativeNagger?: boolean;
  }

  interface Scope {
    setExtras(extras: Record<string, unknown>): void;
  }

  export function init(options: SentryInitOptions): void;
  export function captureException(error: Error): void;
  export function withScope(callback: (scope: Scope) => void): void;
}
