# CLAUDE.md — App Móvil: SosAgro 4.C Field App

> Este archivo es la fuente de verdad para Claude Code en el repositorio `mobile/`.
> Léelo completo antes de ejecutar cualquier acción. Ver también el `CLAUDE.md` raíz del ecosistema.

@AGENTS.md

## Reglas generales

- Toda la comunicación con el usuario debe ser en español.
- Antes de editar cualquier archivo, leer su contenido completo.
- No adivines rutas, imports ni nombres de variables: confírmalos leyendo el código.
- Si tienes dudas bloqueantes, usa `AskUserQuestion` antes de proceder.
- Nunca interrumpas una tarea a mitad para pedir confirmación, salvo riesgo alto.
- Prefiere cambios quirúrgicos sobre refactors amplios no solicitados.
- **Leer `AGENTS.md` antes de usar cualquier API de Expo.** Las versiones de Expo cambian con frecuencia.

---

## Contexto del proyecto

App móvil para encuestadores y técnicos que aplican instrumentos de caracterización a agricultores en zonas rurales. Es el componente más completo de la herramienta de campo porque ofrece capacidades que la web no tiene:

- **Offline-first:** los datos se guardan localmente en SQLite y se sincronizan al backend automáticamente cuando hay conexión. El encuestador puede completar toda una jornada sin internet.
- **Captura multimodal:** además de texto y selección de opciones, soporta captura de **imágenes** (cámara), **audio/voz** y **GPS** directamente desde los instrumentos.
- **Borradores y reanudación:** una encuesta interrumpida puede reanudarse desde la última pregunta respondida.

Es la herramienta principal para trabajo en campo. La aplicación web es complementaria y aplica solo en contextos con conexión estable y sin necesidad de captura multimodal.

**Repositorio activo:** `01-SOSAgro/mobile/`

**Ecosistema:**
```
01-SOSAgro/
├── backend/    # API REST — NestJS (fuente de instrumentos, campañas, auth)
├── frontend/   # Admin + Encuestador web — Next.js
└── mobile/     # Esta app — React Native + Expo (offline-first)
```

> **Estructura de git:** Este directorio (`mobile/`) es un repositorio git **independiente y autónomo**. El directorio raíz `01-SOSAgro/` **no es un repositorio git** y nunca debe serlo. No hay monorepo ni submódulos.

---

## Stack tecnológico

- **Framework:** React Native 0.81 + Expo ~54
- **Routing:** expo-router ~6 (file-based, similar a Next.js App Router)
- **Estado global:** Zustand ^5
- **Base de datos local:** expo-sqlite ~16 + Drizzle ORM ^0.45 (type-safe + migraciones)
- **Auth:** `expo-secure-store` (token cifrado en el dispositivo)
- **Red:** `@react-native-community/netinfo` + `httpClient.ts` custom (retry + backoff exponencial)
- **Background sync:** `expo-background-task` + `expo-task-manager`
- **Error tracking:** `@sentry/react-native`
- **Iconos:** `lucide-react-native`
- **Tests:** Jest + jest-expo + MSW (mocks de red)
- **E2E:** Maestro (YAML)
- **Build / OTA:** EAS (Expo Application Services)

### Comandos

```bash
# Desarrollo
pnpm start              # Servidor Expo (escanear QR con Expo Go)
pnpm android            # Emulador Android
pnpm ios                # Simulador iOS

# Tests
pnpm test               # Jest unit tests
pnpm test --watch       # Watch mode

# Typecheck / Lint
pnpm typecheck           # tsc --noEmit
pnpm lint                # expo lint (ESLint)

# Migraciones SQLite (Drizzle)
pnpm drizzle-kit generate   # Generar migración a partir de cambios en schema.ts

# Build EAS (requiere CLI de EAS instalado y autenticación)
eas build --profile development --platform android   # APK de desarrollo (dev client)
eas build --profile preview --platform android       # APK para pruebas internas
eas build --profile production --platform android    # AAB para Google Play
```

> **Nota:** El background sync **no funciona en Expo Go**. Requiere un EAS dev build (`development` profile) para probar tareas en background.

> **Nota (spec 52, 2026-07-29):** el disparo de sincronización al reconectar
> (`NetworkMonitor`, basado en `@react-native-community/netinfo`) también
> puede diferir entre Expo Go y un build nativo, aunque en teoría no depende
> de `expo-background-task`. Se confirmó que Expo Go no emite la secuencia de
> eventos de `NetInfo` con la misma fidelidad que un APK real: un caso que no
> sincronizaba solo en Expo Go sí lo hizo correctamente (~3.7s) en APK
> `preview`. Para cualquier caso de prueba que dependa de transiciones de
> conectividad (no solo de si hay red o no), reproducir en APK real antes de
> asumir que es un bug — Expo Go no es una base confiable para ese tipo de
> diagnóstico. Detalle completo en
> `spec/52_sincronizacion_automatica_al_reconectar.md` y
> `docs/testing/25-test-spec52.md`.

---

## Variables de entorno

- Archivo de referencia: `.env.example`
- Archivo real (nunca commitear): `.env`

| Variable | Descripción |
|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | URL base del backend |
| `EXPO_PUBLIC_SENTRY_DSN` | DSN de Sentry (opcional; vacío deshabilita) |

**Valores por entorno:**

| Entorno | `EXPO_PUBLIC_API_BASE_URL` |
|---------|---------------------------|
| Local (física / iOS sim) | `http://localhost:3000` |
| Emulador Android | `http://10.0.2.2:3000` (bridge al host) |
| Preview / Producción | `https://sosagroapi.up.railway.app` |

Los perfiles en `eas.json` inyectan automáticamente el valor correcto al hacer build.

---

## Backend y/o APIs

- **Base URL local:** `http://localhost:3000`
- **Base URL producción:** `https://sosagroapi.up.railway.app`
- **Autenticación:** JWT Bearer — token guardado en `expo-secure-store` (cifrado)
- **Cliente HTTP:** `src/api/httpClient.ts` — timeout 15s por request; reintenta internamente solo
  errores 5xx (máx 3 reintentos, backoff exponencial). Los errores de red (sin conexión, timeout)
  se propagan de inmediato como `NetworkError` — el reintento de esos casos ocurre una capa arriba,
  en `SyncQueueService` (ver "Reintentos" más abajo).

Módulos de API (`src/api/`):

| Archivo | Endpoints que consume |
|---------|----------------------|
| `auth.ts` | `POST /api/auth/login`, `GET /api/auth/me` |
| `campaigns.ts` | `GET /api/campaigns`, `GET /api/campaigns/:id/render` |
| `campaignSessions.ts` | `POST /api/campaign-sessions`, `GET /api/campaign-sessions/:id/last-farmer` |
| `instruments.ts` | `GET /api/instruments/:id`, `GET /api/instruments?code=S1` |
| `surveys.ts` | `POST /api/surveys`, `PATCH /api/surveys/:id` |
| `responses.ts` | `POST /api/responses/batch` |
| `farmers.ts` | `GET /api/farmers?search=`, `POST /api/farmers/extract`, `POST /api/farmers/extract-crops` |
| `endpoints.ts` | Definiciones centralizadas de todas las rutas |

**Manejo de errores:**
- 5xx → reintentable dentro de `httpClient` (backoff exponencial, máx 3 intentos por request).
- Timeout / sin conexión (`NetworkError`) → no se reintenta dentro de `httpClient`; se propaga a
  `SyncQueueService`, que reintenta en la siguiente corrida de sync (backoff exponencial hasta
  `MAX_CONSECUTIVE_NETWORK_FAILURES = 5` fallos consecutivos).
- 4xx → no reintentables; `syncQueue` los marca como `failed_validation`

---

## Arquitectura y patrones internos

```
mobile/
├── app/                          # Rutas Expo Router (file-based)
│   ├── _layout.tsx               # Root: auth check + inicialización DB
│   ├── login.tsx
│   ├── (tabs)/                   # Tab navigator con 3 pestañas
│   │   ├── campaign/index.tsx    # Lista de campañas activas
│   │   ├── drafts/index.tsx      # Encuestas guardadas sin enviar
│   │   └── sync/index.tsx        # Estado de cola de sincronización
│   └── campaign/[id]/
│       ├── pre-survey.tsx        # Identificación del agricultor (S1/S2 flow)
│       └── session/[sessionId]/
│           ├── orchestrator.tsx  # Flujo pregunta por pregunta
│           └── completed.tsx     # Confirmación de encuesta enviada
│
└── src/
    ├── api/                      # Clientes HTTP por dominio (ver tabla arriba)
    │
    ├── components/               # Componentes React Native reutilizables
    │   ├── campaign/             # CampaignCard, CampaignProgress, DuplicateAlertModal, PreSurveyForm
    │   ├── common/               # PrimaryButton, SecondaryButton, Screen (safe-area wrapper)
    │   ├── drafts/               # DraftListItem
    │   ├── inputs/               # Todos los inputs de encuesta (ver tabla de tipos)
    │   ├── instrument/           # QuestionRenderer, QuestionScreen, ProgressBar, QuestionContainer
    │   ├── network/              # OfflineBanner
    │   └── sync/                 # SyncStatusBadge
    │
    ├── lib/                      # Utilidades puras
    │   ├── buildResponsesPayload.ts  # Serializa respuestas para el batch API
    │   ├── flattenSections.ts        # Aplana sections → array lineal de preguntas
    │   ├── isQuestionVisible.ts      # Evalúa condiciones de visibilidad
    │   ├── isAnswerComplete.ts       # Valida que una respuesta está completa
    │   ├── getNextStepOffline.ts     # Navegación local sin llamada al servidor
    │   └── logger.ts                 # Logging estructurado con timestamp
    │
    ├── storage/                  # Persistencia local (SQLite via Drizzle)
    │   ├── db/
    │   │   ├── schema.ts         # Tablas: surveys, responses, syncQueue, instrumentCache, campaignCache
    │   │   ├── db.ts             # Inicialización Drizzle + runner de migraciones
    │   │   └── migrations/       # Archivos SQL + index.ts
    │   ├── surveyDraftStore.ts   # CRUD encuestas en SQLite (draft → completed → synced)
    │   ├── syncQueue.ts          # Cola FIFO: enqueue, dequeue, retry management
    │   ├── instrumentCache.ts    # Cache de definiciones de instrumentos
    │   ├── campaignCache.ts      # Cache de campañas renderizadas
    │   ├── secureStorage.ts      # Token cifrado (expo-secure-store)
    │   └── duplicateDetection.ts # Detecta encuestas duplicadas por agricultor + timestamp
    │
    ├── store/                    # Zustand stores (estado en memoria)
    │   ├── useAuthStore.ts           # Auth: token, user, login, logout, session restoration
    │   ├── useCachedCampaignsStore.ts # Campañas + descarga en 3 fases
    │   ├── useCampaignSessionStore.ts # Sesión activa: campaignId, farmerId, fase S1/S2, progreso
    │   ├── useInstrumentSurveyStore.ts # Encuesta activa: index, respuestas, debounced saves (250ms)
    │   └── useSyncStatusStore.ts      # Estado sync: online/offline, pendientes en cola
    │
    └── sync/                     # Motor de sincronización
        ├── SyncQueueService.ts   # Procesador FIFO con backoff exponencial
        ├── NetworkMonitor.ts     # Escucha reconexión → dispara sync inmediato
        └── BackgroundSync.ts     # Tarea programada cada 15 min (expo-background-task)
```

### Patrón de estado (capas)

```
SQLite (Drizzle)          ← fuente de verdad persistente (sobrevive kills de app)
    ↓ hidrata
Zustand stores            ← vista en memoria para UI reactiva
    ↓ leen
Componentes React Native  ← UI
```

### Patrón de sincronización

```
Usuario completa encuesta
    → surveyDraftStore: status = completed
    → syncQueue.enqueue(surveyId)
    → Si hay red: SyncQueueService.processAll() inmediatamente
    → Si no hay red: queda en cola
        → NetworkMonitor detecta reconexión → processAll()
        → BackgroundSync cada 15 min → processAll()
```

Reintentos: backoff exponencial, máx 5 intentos. Errores 4xx → `failed_validation` (no se reintenta).

---

## Flujos de uso de la aplicación

### 1. Autenticación
`login.tsx` → `POST /api/auth/login` → token en `expo-secure-store` → `useAuthStore` hidratado → tabs.

Al relanzar la app, `_layout.tsx` restaura la sesión (`restoreSession()` lee SecureStore → `GET /api/auth/me`).

### 2. Descarga de campaña
Usuario selecciona campaña → descarga en 3 fases:
1. Campaña renderizada (`GET /api/campaigns/:id/render`)
2. Instrumento principal
3. Instrumentos S1/S2 (pre-encuesta de identificación)

Todo guardado en `instrumentCache` / `campaignCache` (SQLite).

### 3. Pre-encuesta (identificación del agricultor)

`pre-survey.tsx` ofrece tres opciones:
- **A:** Buscar agricultor existente (`GET /api/farmers?search=`)
- **B:** Nuevo agricultor → flujo instrumento S1
- **C:** Continuar con el último agricultor de la sesión

Resultado: `farmerId` guardado en `useCampaignSessionStore`.

### 4. Flujo de encuesta (offline-first)

1. `orchestrator.tsx` aplana preguntas con `flattenSections`.
2. `QuestionRenderer` selecciona el input correcto según `question.type`.
3. Cada respuesta se guarda debounced (250ms) en SQLite via `useInstrumentSurveyStore`.
4. Al finalizar: `surveyDraftStore.markCompleted()` + `syncQueue.enqueue()`.
5. Si hay red → sync inmediato. Si no → queda en cola.

### 5. Borradores y reanudación

`drafts/` tab muestra encuestas con `status = draft`. Al seleccionar una, `orchestrator.tsx` reanuda desde la última pregunta respondida.

---

## Tipos de pregunta y componentes

| `question.type` | Componente | Valor almacenado |
|-----------------|-----------|-----------------|
| `open_text` | `OpenTextInput` | `textValue` |
| `numeric` | `NumericInput` | `numericValue` |
| `yes_no` | `SingleChoiceList` | `optionId` + `booleanValue` |
| `single_choice` | `SingleChoiceList` | `optionId` |
| `likert` | `LikertScale` | `optionId` |
| `multiple_choice` | `MultipleChoiceList` | `optionIds[]` |
| `compliance` | `ComplianceInput` | `optionId` (Sí / No / N/A) |

---

## Convenciones de código

- Lenguaje: **TypeScript estricto** (`strict: true`).
- Archivos de módulo: `camelCase.ts` / `camelCase.tsx`.
- Componentes: `PascalCase.tsx`.
- Stores: `useCamelCase.ts` (prefijo `use`).
- No usar `any`; si es inevitable, documentar con `// TODO: type this`.
- Estilos: `StyleSheet.create()` o estilos inline — sin styled-components.
- Tipos globales del dominio: `src/types/`.
- Leer `AGENTS.md` antes de tocar cualquier API de Expo.

---

## Testing

- **Framework:** Jest + jest-expo
- **Ubicación:** `src/__tests__/`
- **Convención:** `*.test.ts`
- **E2E:** Maestro — `e2e/pollster-flow.yaml`
- **Mocks:** MSW + mocks manuales en `src/__tests__/__mocks__/`

Tests existentes:
- `buildResponsesPayload.test.ts`
- `db.test.ts`
- `httpClient.test.ts`
- `surveyDraftStore.test.ts`
- `SyncQueueService.test.ts`

El test E2E cubre: login → campaña → pre-encuesta → responder → kill de app → retomar borrador → modo avión → sync al reconectar.

No borrar ni modificar tests existentes sin instrucción explícita.

---

## Specs de funcionalidades

- Carpeta: `specs/`
- Nomenclatura: `spec{{NN}}.md` (ej. `spec19.md`)
- Antes de implementar, el spec debe estar aprobado por el usuario.
- Los specs completados **no se borran**; se marcan con `[DONE]` en el título.

---

## Nuevas funcionalidades

### Antes de implementar

1. Analizar impacto en:
   - El flujo offline (¿requiere datos pre-descargados?)
   - El schema SQLite (¿necesita migración Drizzle?)
   - La cola de sync (¿cambia el payload al backend?)
2. Usar el subagente `architect` para el plan (fases y archivos; **sin código**).
3. Guardar el plan en `specs/`.
4. Esperar aprobación del usuario.
5. Crear rama nueva desde `development`.

### Durante la implementación

- Trabajar fase por fase según el spec.
- Reportar bloqueantes no previstos antes de improvisar.
- Ante cualquier cambio en el schema SQLite, generar migración con `pnpm drizzle-kit generate`.

---

## Acciones prohibidas

> Claude nunca debe realizar las siguientes acciones sin confirmación explícita del usuario en esa misma sesión:

- Borrar archivos o carpetas.
- Ejecutar `eas build --profile production` sin confirmación explícita.
- Hacer push a `main` o `development` directamente.
- Modificar `eas.json` sin avisar (afecta builds distribuidos).
- Instalar dependencias nuevas sin mencionarlo.
- Commitear archivos `.env*` reales.
- Modificar `schema.ts` sin generar la migración Drizzle correspondiente.

---

## Git — Branching & Commits

### Estructura de ramas

| Propósito | Prefijo | Ejemplo |
|-----------|---------|---------|
| Nueva funcionalidad o spec | `feature/` | `feature/background-sync` |
| Corrección de bug | `bug/` | `bug/offline-queue-retry` |
| Preparación de release | `deploy/` | `deploy/v1.0.0-android` |

- `main` — producción; solo recibe merges desde `deploy/`.
- `development` — integración; `feature/` y `bug/` se desprenden de aquí.
- Al mergear a `development`, eliminar la rama inmediatamente.

### Commits (Conventional Commits, en inglés)

```
<type>(<scope>): <short description>
```

Tipos válidos: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`, `ci`.

Ejemplos:
```
feat(sync): add exponential backoff for failed sync entries
fix(offline): prevent duplicate entries in sync queue on reconnect
chore(schema): add otherText column to responses table
```
