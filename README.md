# SOS Agro 4C — Mobile App

Offline-first survey collection app for the SOSAgro 4C project. Field researchers use it to apply agricultural characterization instruments to farmers across six Colombian departments (Antioquia, Caquetá, Chocó, La Guajira, Meta, Norte de Santander). Surveys are stored locally in SQLite and synced to the backend API when connectivity is restored.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20+ |
| pnpm | 9+ |
| Expo Go | latest (for development on device) |
| EAS CLI | latest (`npm i -g eas-cli`) |

---

## Setup

```bash
pnpm install
cp .env.example .env  # set EXPO_PUBLIC_API_BASE_URL
pnpm start            # launches Expo dev server
```

Scan the QR code with Expo Go (Android/iOS) to open the app.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Yes | Base URL of the SOSAgro backend API (e.g. `http://10.0.2.2:3000` for local, `https://sosagroapi.up.railway.app` for staging/prod) |
| `EXPO_PUBLIC_SENTRY_DSN` | No | Sentry DSN for crash reporting (native crashes only work in standalone builds) |

---

## Available scripts

| Script | Description |
|---|---|
| `pnpm start` | Start Expo dev server (Metro bundler) |
| `pnpm android` | Run on Android emulator / connected device |
| `pnpm ios` | Run on iOS simulator |
| `pnpm test` | Run Jest unit tests |
| `pnpm build:preview` | EAS build for internal testing (APK) |
| `pnpm build:prod` | EAS build for production (AAB) |

---

## Project structure

```
mobile/
├── app/                  # expo-router file-based routes (screens)
├── src/
│   ├── components/       # Reusable UI components
│   ├── stores/           # Zustand state stores
│   ├── services/         # Sync queue, network monitor, background sync
│   ├── db/               # Drizzle ORM schema + migrations
│   └── lib/              # HTTP client, utilities
├── assets/               # Icons, splash screen, images
├── docs/                 # Architecture and field guide documentation
├── app.config.ts         # Expo dynamic config
└── eas.json              # EAS Build / Update profiles
```

---

## Development notes

**Expo Go limitations** — the following features require a full native build (`expo run:android` or an EAS development build):

- Background sync (runs only while the app is in the foreground in Expo Go)
- Sentry native crash reporting
- Any native module not included in the Expo Go client

For full feature testing, build a development client:

```bash
eas build --profile development --platform android
```

Then install the resulting APK and open it — it works like Expo Go but with the full native module set.

---

## Building for distribution

**Preview build** (internal APK for testers):

```bash
eas build --profile preview --platform android
```

**Production build** (AAB for Google Play):

```bash
eas build --profile production --platform android
```

**OTA update** (push JS changes without a full build):

```bash
eas update --channel preview --message "descripción del cambio"
```

OTA updates only work if the native code has not changed. If you add or update a native dependency, a full EAS build is required.

> Before publishing a production build, replace `YOUR_PROJECT_ID` in `app.config.ts` with the actual Expo project ID from `https://expo.dev`.
