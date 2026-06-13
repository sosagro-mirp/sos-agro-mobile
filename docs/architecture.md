# Architecture — SOS Agro 4C Mobile

## Layer diagram

```
┌─────────────────────────────────────┐
│            UI (expo-router)         │
│  screens: campaign, instrument,     │
│           sync, drafts              │
└──────────────┬──────────────────────┘
               │ reads/writes
┌──────────────▼──────────────────────┐
│         Zustand Stores              │
│  useAuthStore · useCampaignSession  │
│  useInstrumentSurvey · useSyncStatus│
│  useCachedCampaigns                 │
└──────────────┬──────────────────────┘
      ┌────────┴────────┐
      │                 │
┌─────▼──────┐   ┌──────▼──────┐
│  Sync layer│   │  Cache/API  │
│SyncQueue   │   │httpClient   │
│Service     │   │TanStack Q   │
│NetworkMon  │   └──────┬──────┘
│BgSync      │          │
└─────┬──────┘          │
      └────────┬────────┘
               │
┌──────────────▼──────────────────────┐
│    SQLite (expo-sqlite + Drizzle)   │
│  surveys · responses · syncQueue   │
│  instrumentCache · campaignCache   │
└─────────────────────────────────────┘
```

---

## Offline flow

1. **User taps an answer** — the UI component calls the corresponding Zustand store action.
2. **Store debounce** — `useInstrumentSurvey` batches writes and flushes to SQLite every 250 ms, so the device has a durable copy even if the app is killed.
3. **Survey completion** — when the user submits the last question, the store serialises the full response payload and writes a record to the `syncQueue` table with status `pending`.
4. **SyncQueueService** — a singleton service watches the queue. When network is available it picks the oldest `pending` record (FIFO), calls `POST /api/responses/batch`, and marks the record `synced`. On a non-retryable HTTP error (4xx) it marks it `error`; on a retryable error (5xx / network timeout) it increments `retryCount` and re-queues with exponential backoff.
5. **NetworkMonitor** — uses `@react-native-community/netinfo` to emit `online`/`offline` events. SyncQueueService listens to these events to start or pause processing.
6. **BackgroundSync** — on supported platforms, a background task runs SyncQueueService every 15 minutes when the app is in the background.

---

## Key architectural decisions

| Decision | Rationale |
|---|---|
| **Conservative offline strategy** — a network connection is required to _start_ a new visit/survey session | Ensures the instrument definition and campaign metadata are always up to date before data collection begins. Avoids version conflicts between cached and live instruments. |
| **Server-side step conditions** | Branching logic in the instrument is evaluated by the backend at render time (`GET /api/instruments/:id/render`), keeping the mobile client simple and avoiding divergence if logic changes. |
| **FIFO sync queue** | Preserves chronological order of submissions, which matters for audit trails and time-series analysis. |
| **Exponential backoff** | Prevents flooding the backend after connectivity is restored, especially relevant in low-bandwidth rural settings. |
| **SQLite as the single source of truth** | All state that needs to survive app restarts (surveys, responses, cache) lives in SQLite. Zustand stores are hydrated from SQLite on app launch and act as a fast in-memory view. |
| **OTA updates via EAS Update** | Minor JS fixes can be delivered without submitting a new APK, important for field deployments where users may not update through the Play Store promptly. |

---

## Campaign fill flow

```
User opens campaign list
        │
        ▼ TanStack Query fetches campaigns
useCachedCampaigns reads SQLite cache
        │
        ├─ if online  → GET /api/campaigns → update SQLite cache → display list
        └─ if offline → display cached list (badge "Disponible sin conexión")

User selects campaign
        │ (requires network)
        ▼
GET /api/instruments/:id/render → hydrate useInstrumentSurvey store
POST /api/surveys                → obtain surveyId
        │
        ▼
User navigates question by question
        │ every answer → store action → 250ms debounce → SQLite (responses table)
        ▼
User reaches last question and confirms submit
        │
        ▼
useInstrumentSurvey.buildResponsesPayload()
        │
        ▼
Write to syncQueue table (status: pending)
        │
SyncQueueService picks up record
        │
        ├─ online  → POST /api/responses/batch
        │              ├─ 2xx → mark synced
        │              ├─ 4xx → mark error (no retry)
        │              └─ 5xx/timeout → increment retryCount, exponential backoff
        └─ offline → wait for NetworkMonitor online event
```

---

## Tech stack

| Technology | Version | Role |
|---|---|---|
| React Native | 0.76 | Core mobile framework |
| Expo SDK | 54 | Managed workflow, native modules |
| expo-router | 4.x | File-based navigation |
| expo-sqlite | 15.x | Local relational storage |
| Drizzle ORM | 0.30+ | Type-safe SQLite schema + queries |
| Zustand | 5 | Client state management |
| TanStack Query | 5 | Server state, caching, background refetch |
| @react-native-community/netinfo | latest | Network connectivity detection |
| EAS Build / Update | latest | CI/CD and OTA updates |
