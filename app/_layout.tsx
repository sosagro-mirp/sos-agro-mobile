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
import { ThemeProvider } from "../src/theme/ThemeProvider";

initSentry();

SplashScreen.preventAutoHideAsync();

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

export default function RootLayout() {
  const { isRestoring, restoreSession } = useAuthStore();
  const loadInstrumentCache = useCachedInstrumentsStore((s) => s.loadFromCache);
  const [dbReady, setDbReady] = useState(false);

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
      .catch((err) => { captureError(err); logger.error('[App] runMigrations failed', err); });
  }, []);

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

  useEffect(() => {
    if (fontsLoaded && !isRestoring && dbReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isRestoring, dbReady]);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthGuard />
        <ChangeRequestBanner />
        <Stack screenOptions={{ headerShown: false }}>
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
      </QueryClientProvider>
    </ThemeProvider>
  );
}
