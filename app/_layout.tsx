import { useEffect, useRef, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useFonts,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
  JetBrainsMono_800ExtraBold,
} from "@expo-google-fonts/jetbrains-mono";
import * as SplashScreen from "expo-splash-screen";
import { useAuthStore } from "../src/store/useAuthStore";
import { useCachedInstrumentsStore } from "../src/store/useCachedInstrumentsStore";
import { runMigrations } from "../src/storage/db/db";
import { syncQueueStorage } from "../src/storage/syncQueue";
import { surveyDraftStore } from "../src/storage/surveyDraftStore";
import { pendingSessionStorage } from "../src/storage/pendingSessions";
import { NetworkMonitor } from "../src/sync/NetworkMonitor";
import { BackgroundSync } from "../src/sync/BackgroundSync";
import { initSentry, captureError } from "../src/lib/sentry";
import { logger } from "../src/lib/logger";
import { ChangeRequestBanner } from "../src/components/requests/ChangeRequestBanner";
import { ThemeProvider, useTheme } from "../src/theme/ThemeProvider";
import { SnackbarProvider } from "../src/components/common/Snackbar";
import { StartupErrorScreen } from "../src/components/common/StartupErrorScreen";
import { ThemedStatusBar } from "../src/components/common/ThemedStatusBar";
import {
  SPLASH_TIMEOUT_MS,
  pendingSplashDependencies,
  shouldHideSplash,
} from "../src/lib/splashGate";

initSentry();

// Spec 76, Fase 2: sin `.catch()` esto era una promesa sin manejar.
SplashScreen.preventAutoHideAsync().catch((err) =>
  logger.error('[App] preventAutoHideAsync failed', err),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60 * 5 },
  },
});

function AuthGuard() {
  const { user, isRestoring } = useAuthStore();
  const router = useRouter();
  // Track previous user value to only act on actual changes, not re-renders
  const prevUserRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (isRestoring) return;

    const prevId = prevUserRef.current;
    const currId = user?.userId ?? null;

    // Skip if user identity hasn't changed (avoids resetting navigation mid-session)
    if (prevId === currId) return;
    prevUserRef.current = currId;

    if (!user) {
      router.replace("/login");
    } else {
      router.replace("/campaign");
    }
  }, [user, isRestoring]);

  return null;
}

// Mismo motivo que `SplashGate`: `RootLayout` renderiza `<ThemeProvider>`,
// así que no puede leer `useTheme()` en su propio cuerpo (el provider todavía
// no montó). Vive dentro de `<ThemeProvider>` solo para poder aplicar
// `contentStyle` al Stack — sin esto, cada transición entre pantallas (ej.
// pregunta → pregunta, spec 74 Fase 4) mostraba un flash del blanco por
// defecto de `react-native-screens` antes de que el fondo real de cada
// pantalla se pintara, mucho más visible en tema oscuro.
function AppStack() {
  const { colors } = useTheme();

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surfaceMuted } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="campaign/[id]/pre-survey" />
      <Stack.Screen name="campaign/[id]/session/[sessionId]/orchestrator" />
      <Stack.Screen name="campaign/[id]/session/[sessionId]/completed" />
      <Stack.Screen name="instrument/[id]/download" />
      <Stack.Screen name="instrument/[id]/start" />
      <Stack.Screen
        name="instrument/[id]/question/[index]"
        options={{ animation: "none" }}
      />
      <Stack.Screen name="instrument/[id]/review" />
      <Stack.Screen name="instrument/[id]/completed" />
      <Stack.Screen name="dev/logs" />
    </Stack>
  );
}

// Oculta el splash solo cuando fuentes, DB, sesión Y tema están listos. Vive
// dentro de <ThemeProvider> para poder leer `restored`: mantener el splash
// hasta restaurar el tema es lo que evita el flash claro→oscuro, en lugar del
// antiguo `return null` del propio ThemeProvider (ver el comentario en
// src/theme/ThemeProvider.tsx: ese null causaba un bucle infinito de
// remontaje en Samsung One UI 7 / Android 15).
//
// Spec 76, Fase 3: retener el splash tiene un riesgo simétrico al que corrigió
// —si una dependencia nunca resuelve (p. ej. `runMigrations()` rechaza y
// `dbReady` se queda en false), el splash no se ocultaría jamás y la app
// quedaría indistinguible de un cuelgue—. De ahí el tope de tiempo: pasado
// SPLASH_TIMEOUT_MS el splash se oculta igual y se reporta qué faltaba.
// Las dependencias se pasan como props primitivas, no como un objeto: un
// objeto nuevo en cada render reejecutaría el efecto constantemente, que es
// justo el tipo de churn que conviene evitar en la ruta de arranque.
function SplashGate({
  ready,
  fontsLoaded,
  dbReady,
  isRestoring,
}: {
  ready: boolean;
  fontsLoaded: boolean;
  dbReady: boolean;
  isRestoring: boolean;
}) {
  const { restored } = useTheme();
  const hiddenRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
    if (hiddenRef.current) return;

    const hide = (timedOut: boolean) => {
      if (hiddenRef.current) return;
      hiddenRef.current = true;

      if (timedOut) {
        const pending = pendingSplashDependencies({ fontsLoaded, dbReady, isRestoring, restored });
        const message = `[SplashGate] splash ocultado por tope de ${SPLASH_TIMEOUT_MS}ms; pendientes: ${pending.join(', ') || 'ninguna'}`;
        logger.error(message);
        captureError(new Error(message));
      }

      SplashScreen.hideAsync().catch((err) =>
        logger.error('[SplashGate] hideAsync failed', err),
      );
    };

    if (shouldHideSplash({ ready, restored, elapsedMs: Date.now() - mountedAtRef.current })) {
      hide(!(ready && restored));
      return;
    }

    const remaining = SPLASH_TIMEOUT_MS - (Date.now() - mountedAtRef.current);
    const timer = setTimeout(() => hide(true), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [ready, restored, fontsLoaded, dbReady, isRestoring]);

  return null;
}

export default function RootLayout() {
  const { isRestoring, restoreSession } = useAuthStore();
  const loadInstrumentCache = useCachedInstrumentsStore((s) => s.loadFromCache);
  const [dbReady, setDbReady] = useState(false);
  // Spec 76, Fase 3: un fallo de migraciones dejaba `dbReady` en false para
  // siempre — splash eterno y sin mensaje. Ahora se registra como estado
  // propio para poder mostrar una pantalla accionable.
  const [startupError, setStartupError] = useState<Error | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const [fontsLoaded] = useFonts({
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
    JetBrainsMono_800ExtraBold,
  });

  useEffect(() => {
    runMigrations()
      .then(async () => {
        setDbReady(true);
        await restoreSession();
        loadInstrumentCache().catch((err) => logger.error('[App] loadInstrumentCache failed', err));
      })
      .catch((err) => {
        captureError(err);
        logger.error('[App] runMigrations failed', err);
        setStartupError(err instanceof Error ? err : new Error(String(err)));
      });
  }, [retryToken]);

  useEffect(() => {
    if (!dbReady) return;

    logger.init();

    // Reset any entries that were in_flight when the app was last killed.
    syncQueueStorage.resetInFlightToRetry().catch((err) =>
      logger.error('[App] resetInFlightToRetry failed', err),
    );

    // Log how many offline sessions are pending resolution.
    pendingSessionStorage.listPending()
      .then((pending) => {
        if (pending.length > 0) {
          logger.info(`[App] ${pending.length} offline session(s) pending sync`);
        }
      })
      .catch((err) => logger.error('[App] listPending failed', err));

    // Purge synced surveys older than 30 days to keep local DB lean.
    surveyDraftStore.purgeSyncedSurveys()
      .then((count) => { if (count > 0) logger.info(`Purged ${count} old synced surveys`); })
      .catch((err) => logger.error('[App] purgeSyncedSurveys failed', err));

    NetworkMonitor.start();
    BackgroundSync.register().catch(() => {
      // expo-background-fetch not available in Expo Go — silently ignored
    });

    // Cold start: process queue if network is available.
    NetworkMonitor.checkAndSync().catch((err) => {
      captureError(err);
      logger.error('[App] checkAndSync failed', err);
    });

    return () => NetworkMonitor.stop();
  }, [dbReady]);

  // El árbol se renderiza SIEMPRE; la pantalla de error sustituye al stack de
  // navegación, nunca a los providers. Desmontar providers es exactamente lo
  // que provocó el bucle infinito de remontaje del 2026-08-18.
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          <ThemedStatusBar />
          <SplashGate
            // Un fallo de arranque cuenta como "listo" a efectos del splash:
            // hay algo que mostrar, y sostenerlo hasta el tope de 10s solo
            // retrasaría el mensaje de error.
            ready={(fontsLoaded && !isRestoring && dbReady) || startupError !== null}
            fontsLoaded={fontsLoaded}
            dbReady={dbReady}
            isRestoring={isRestoring}
          />
          {startupError ? (
            <StartupErrorScreen
              error={startupError}
              onRetry={() => {
                setStartupError(null);
                setRetryToken((n) => n + 1);
              }}
            />
          ) : (
            <>
              <AuthGuard />
              <ChangeRequestBanner />
              <AppStack />
            </>
          )}
        </SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
