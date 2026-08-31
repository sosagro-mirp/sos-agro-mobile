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
│   ├── (tabs)/                   # Tab navigator con 4 pestañas
│   │   ├── campaign/index.tsx    # Lista de campañas activas
│   │   ├── drafts/index.tsx      # Encuestas guardadas sin enviar
│   │   ├── sync/index.tsx        # Estado de cola de sincronización
│   │   └── requests/index.tsx    # Solicitudes de cambio
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
    │   ├── common/               # PrimaryButton, SecondaryButton, Screen (safe-area wrapper),
    │   │                          # ThemeToggle (spec 63)
    │   ├── drafts/               # DraftListItem
    │   ├── inputs/               # Todos los inputs de encuesta (ver tabla de tipos)
    │   ├── instrument/           # QuestionRenderer, QuestionScreen, ProgressBar, QuestionContainer
    │   ├── network/              # OfflineBanner
    │   ├── requests/             # ChangeRequestBanner, ChangeRequestForm
    │   └── sync/                 # SyncStatusBadge
    │
    ├── theme/                    # resolveTheme.ts (funciones puras), colors.ts
    │   │                          # (lightColors/darkColors), ThemeProvider.tsx + useTheme()
    │   │                          # — spec 63. Persistencia en storage/themeStorage.ts
    │   └── fonts.ts               # JetBrains Mono
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
    │   ├── themeStorage.ts       # Preferencia de tema (expo-secure-store) — spec 63
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

### Canal OTA (expo-updates)

Desde el spec 80 (2026-08-29), `expo-updates` está instalado y el canal OTA es efectivo: la mayoría
de los cambios puramente JS **ya no exigen build EAS** ni vuelta física por las tablets — se publican
con `eas update`. Ver `mobile/docs/ota-updates.md` para el procedimiento completo (qué va por OTA,
comando de publicación, verificación, rollback) y la regla de oro: **nunca tocar `version` en
`app.config.ts` salvo que se vaya a compilar e instalar un build nativo nuevo**.

**Pendiente del spec 80:** la Fase 4 (sourcemaps de Sentry para bundles OTA) ya tiene
`SENTRY_AUTH_TOKEN` registrado como secreto de EAS y `SENTRY_DISABLE_AUTO_UPLOAD: false` en
`eas.json`; falta verificarlo con un build y una publicación OTA reales (Fase 6).

### Pendientes de build EAS

`mobile/docs/pendientes-de-build.md` lleva la lista de cambios que **sí** exigen build nativo (no
alcanza con OTA — dependencias nativas, permisos, plugins de config, cambio de `version`; ver
`mobile/docs/ota-updates.md` para el criterio completo) y que todavía no se han verificado en un
build real. El plan de EAS tiene cupo limitado por mes, así que no se genera un build por cada
cambio de ese tipo.

- Al cerrar cualquier cambio de código en `mobile/` que exija build nativo, **agregar una fila a esa
  tabla** antes de continuar.
- **Cuando la tabla acumule 3 o más filas pendientes, o alguna sea bloqueante para una fecha
  comprometida** (ej. una ventana de instalación en tablets), señalarlo al usuario y **proponer**
  generar un build EAS `preview` que cubra todos los pendientes a la vez. Nunca generarlo sin esa
  propuesta y su confirmación explícita — la regla de "nunca ejecutar `eas build` sin autorización
  del usuario en esa misma instancia" sigue vigente sin excepción, sin importar cuántas filas se
  hayan acumulado.
- Al confirmarse un build, vaciar de la tabla las filas que cubre y registrar el `versionCode`
  resultante en el archivo `docs/testing/test-NNN` de cada spec afectado.

### Verificación previa a un build EAS

> Añadido tras el spec 80 (2026-08-29): un build `preview` falló en la fase `Run gradlew` por un
> problema de resolución de `@sentry/cli` bajo pnpm (`A problem occurred starting process
> '.../node_modules/@sentry/cli/bin/sentry-cli'`) — un error que **sí era detectable localmente**
> sin gastar cuota, y que ya se había topado una vez antes (2026-07-23, commit `b73119f`) sin
> diagnosticarse a fondo. El cupo de EAS es limitado y compartido entre Android e iOS: cada build
> fallido evitable es cupo real perdido.

**Antes de proponer o lanzar cualquier `eas build`**, correr esta secuencia y no proceder hasta que
todo pase:

1. `pnpm typecheck && pnpm lint && pnpm test` — en verde, sin excepciones nuevas.
2. `npx expo-doctor` — 18/18 (o el total vigente) sin issues.
3. `npx eas-cli build:inspect -p android -s pre-build -o <tmp-dir> -e <profile> --force` — corre
   `expo prebuild` y resuelve credenciales **sin subir nada a la cola de EAS** (no consume cupo).
   Detecta errores de configuración (`app.config.ts`, plugins, credenciales) antes de la fase nativa.
4. **Si hay Android SDK local** (`echo $ANDROID_HOME`, `ls ~/Library/Android/sdk` o equivalente),
   **`df -h /` muestra al menos ~6 GB libres**, y el cambio toca algo que solo falla en la fase de
   Gradle (dependencias nativas nuevas, plugins de config, tareas de Gradle de terceros como la de
   Sentry) — correr `npx eas-cli build:inspect -p android -s post-build -o <tmp-dir> -e <profile>
   --force`, que ejecuta el **build nativo completo** (Gradle + Android SDK) en la máquina local.
   Esto sí reproduce fielmente fallos de Gradle que `pre-build` no detecta, y tampoco consume cupo
   de EAS. Es más lento (varios minutos) y **pesado en disco**: la primera vez descarga la
   distribución de Gradle completa a `~/.gradle` (~4 GB) además de copiar el proyecto entero a
   `<tmp-dir>`. Verificar espacio libre **antes** de lanzarlo — se agotó el disco corriendo esto el
   2026-08-29 (quedaba menos margen del que parecía) y tumbó otras herramientas hasta liberar
   espacio. Borrar `<tmp-dir>` en cuanto termine la inspección, esté en verde o no.
5. Si algo de lo anterior revela un error, diagnosticar y corregir **antes** de proponer el build al
   usuario — no proponer "probemos en la nube a ver qué pasa" cuando el error es reproducible local.
6. Recién entonces, señalar al usuario lo que cubre el build propuesto (specs, filas de
   `pendientes-de-build.md`) y pedir su autorización explícita — sigue sin haber excepción a esa regla.

Este flujo no reemplaza el build real: `pre-build` no ejecuta Gradle, y ni siquiera `post-build` local
garantiza paridad 100% con el worker Linux de EAS (rutas, variante de OS, cachés). Pero cualquier
fallo de configuración, dependencias o de las primeras fases de Gradle debería aparecer aquí primero.

---

## Specs de funcionalidades

- Carpeta: `spec/` en la raíz del ecosistema (`../spec/` desde este repositorio).
  Todos los specs viven ahí, sin importar cuántos repositorios afecten —
  ver el `CLAUDE.md` raíz. Este repositorio ya no tiene una carpeta `specs/` propia.
- Nomenclatura: `NN_slug_descriptivo.md` (ej. `57_mejoras_post_lanzamiento_mobile.md`),
  con numeración continua compartida por todo el ecosistema.
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
3. Guardar el plan en `../spec/` (raíz del ecosistema).
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
