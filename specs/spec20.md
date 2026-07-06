# Spec 20: Soporte offline completo en pre-survey

## Problema

El encuestador descarga campañas e instrumentos mientras tiene WiFi en la oficina y
luego trabaja en campo sin internet. El flujo de pre-encuesta tiene tres opciones
(Buscar / Nuevo / Continuar con último), pero todas dependen de llamadas al backend
para crear la sesión (`POST /api/campaign-sessions`), lo que las bloquea por completo
sin conexión.

El único desbloqueante real es que **el `sessionId` lo genera el backend**. No puede
generarse localmente porque el orquestador, `getNextStep`, `extractFarmer` y
`extractCrops` lo necesitan como llave foránea en el servidor. Por tanto, la estrategia
es diferir la creación de la sesión hasta tener red, usando un `sessionId` local
provisional mientras tanto.

### Qué funciona hoy (estado base del Spec 19 ya implementado)

- Los instrumentos S1/S2 ya se cachean en `instrumentCache` durante `refresh()`.
- `getNextStepOffline` computa el siguiente paso sin backend, leyendo `campaignCache`.
- `lastFarmer` se persiste en `SecureStorage` y se carga al arrancar.
- `syncQueue` envía respuestas en batch al reconectar.
- El orquestador ya inyecta S1/S2 y llama `extractFarmer`/`extractCrops` online.

### Qué falta

| Opción | Bloqueante actual |
|--------|-------------------|
| A — Buscar encuestado | `searchFarmers` llama al backend; sin caché local de farmers |
| B — Nuevo encuestado | `createCampaignSession` requiere red; S1/S2 no se pueden iniciar offline |
| C — Continuar con último | `createCampaignSession` requiere red aunque el `farmerId` ya está guardado |

---

## Solución: sessionId provisional local

### Idea central

Cuando no hay red, se genera un `sessionId` local con prefijo `local_` + UUID. Este ID
provisional se usa para crear drafts en SQLite, encolar respuestas y navegar al
orquestador. Al reconectar, el `SyncQueueService` detecta que hay entradas con
`sessionId` provisional, crea la sesión real en el backend, obtiene el `sessionId`
definitivo, y remapta todas las entradas de `syncQueue` y `surveys` antes de enviar
las respuestas.

### Invariantes que se deben mantener

1. El backend nunca ve un `sessionId` provisional. El remapeo ocurre 100% en el cliente
   antes del primer POST.
2. `extractFarmer` y `extractCrops` son siempre online-only. Solo se ejecutan después
   de que las respuestas de S1/S2 llegan al backend.
3. `getNextStep` sigue siendo online-only para sesiones ya confirmadas. Offline,
   `getNextStepOffline` ya cubre el caso de saltar pasos.
4. La opción A (buscar encuestado) offline usa un caché local de farmers que se
   construye al descargar campañas y al completar encuestas previas.

---

## Decisiones de diseño no triviales

### D1 — Prefijo `local_` en sessionId provisional

Un sessionId provisional tiene el formato `local_<uuid-v4>`. Esto permite detectarlo
de forma explícita y sin ambigüedad en cualquier punto del código. Alternativa
descartada: flag booleano en el store — es menos robusto porque el store se pierde
si la app se reinicia.

### D2 — Nueva tabla `pendingSessions` en SQLite

Los sessionIds provisionales se persisten en una tabla dedicada (`pending_sessions`)
con los datos necesarios para crear la sesión real: `campaignId`, `farmerId` (opcional),
`userId`, `localSessionId`, `realSessionId` (null hasta resolverse), `status`.

Alternativa descartada: guardarlo solo en SecureStorage — no es queryable ni soporta
múltiples sesiones pendientes.

### D3 — Remapeo antes del envío, no después

El `SyncQueueService` resuelve el sessionId provisional antes de intentar cualquier
POST de respuestas. Esto evita que el backend reciba un `campaignSessionId` inventado.
Si la creación de la sesión falla (red caída otra vez), toda la entrada vuelve a
`pending` y se reintenta en el siguiente ciclo.

### D4 — Caché local de farmers (tabla `farmerCache`)

Para la opción A offline, se agrega una tabla `farmer_cache` en SQLite. Se alimenta
de dos fuentes:
- Resultados de búsquedas online previas (guardados al seleccionar un farmer).
- Farmers que emergen de sesiones completadas (se agregan tras `extractFarmer`).

La búsqueda offline se hace por `name`, `lastName` y `documentId` con LIKE en SQLite.
No hay sincronización inversa de farmers del backend — solo se cachean los que el
encuestador ya ha visto.

### D5 — El orquestador NO cambia para la ruta offline básica

Cuando el encuestador elige "Continuar con último" offline, no hay S1/S2. La sesión
es provisional pero el `injectionPhase` del store es `'none'`, por lo que el
orquestador usa `getNextStepOffline` directamente (ya existe). No se añade nueva
lógica al orquestador para este caso.

### D6 — Inyección offline de S1/S2 requiere una variante local de `injectInstrument`

La función `injectInstrument` actual llama `createSurvey` (online). Para el modo
offline se agrega `injectInstrumentOffline` que:
- No llama `createSurvey` al backend.
- Genera un `surveyId` local (`local_<uuid>`).
- Crea el draft en SQLite con ese surveyId.
- Encola en `syncQueue` con el `campaignSessionId` provisional.

El `surveyId` local también necesita remapeo cuando se resuelve la sesión. Ver Fase 5.

### D7 — El `SyncQueueService` agrega una fase de "resolución de sesiones" antes del procesamiento

Se añade un método `resolveLocalSessions()` que corre al inicio de `processAll()`.
Consulta `pending_sessions` con `status = 'pending'`, y para cada una:
1. Llama `createCampaignSession` con los datos originales.
2. Actualiza `campaignSessionId` en `surveys` y `sync_queue` de local a real.
3. Marca la entrada en `pending_sessions` como `resolved`.

Si falla la red, se reintenta en el siguiente `processAll()`.

### D8 — Extracción provisional local de farmer al completar S1 offline

En lugar de bloquear en `offline_extraction_pending`, el orquestador extrae el farmer
**localmente** leyendo las respuestas de S1 desde SQLite y mapeándolas mediante las
anotaciones `systemField` del instrumento cacheado.

Resultado: un objeto `Farmer` provisional con `farmerId = "local_farmer_<uuid>"`.
Este ID provisional fluye igual que `local_session_<uuid>`: se usa en el store, en
`farmerCache` y en `lastFarmer` hasta que la sincronización lo remplaza por el ID real.

**Deduplicación offline**: antes de crear un farmer provisional, se busca en
`farmerCache` por `documentId`. Si hay coincidencia, se reutiliza el farmer existente
y no se genera un ID provisional nuevo. Esto cubre el caso más común (agricultor
conocido sin conexión cuya cédula ya fue vista antes).

**Al sincronizar**: `SyncQueueService`, después de ejecutar `extractFarmer` real y
obtener el `farmerId` definitivo, remapta el ID provisional en `surveys`, `syncQueue`,
`pending_sessions` y `farmerCache`. El mismo patrón que el remapeo de `sessionId`.

**Trade-off**: si S1 tiene lógica Q9 (encuestado ≠ productor), la extracción local
puede asignar mal quién es el farmer. El backend corrige esto al sincronizar. En el
intervalo offline el nombre mostrado puede ser el del encuestado, no el del productor.
Se acepta para MVP.

### D9 — `extractCrops` offline se omite (sin bloqueo)

`extractCrops` crea cultivos en el backend a partir de S2. Offline, no hay forma de
conocer los IDs de `TypeOfCrop` que el backend asignaría. Se opta por no extraer crops
localmente: al completar S2 offline el orquestador llama `store.completeS2Injection()`
directamente y continúa. El `SyncQueueService` ejecuta `extractCrops` real al
sincronizar. No hay ID provisional que remapar para cultivos.

---

## Fases de implementación

---

### Fase 1 — Schema SQLite: nuevas tablas y migración

**Objetivo:** Agregar las dos tablas nuevas que requiere el flujo offline.

#### `src/storage/db/schema.ts`

Agregar dos tablas:

**`pending_sessions`** — Registra sesiones creadas offline que aún no tienen `sessionId` real.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `local_session_id` | `text PRIMARY KEY` | UUID con prefijo `local_` |
| `campaign_id` | `text NOT NULL` | Campaña a la que pertenece |
| `farmer_id` | `text` | Null si es nuevo encuestado |
| `user_id` | `text` | Usuario que inició la sesión |
| `real_session_id` | `text` | Null hasta que el backend confirma |
| `status` | `text` enum(`pending`, `resolved`, `failed`) | Estado de resolución |
| `created_at` | `integer` timestamp | Fecha de creación |
| `resolved_at` | `integer` timestamp | Fecha de resolución (null si pending) |

**`farmer_cache`** — Caché local de agricultores conocidos para búsqueda offline.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `farmer_id` | `text PRIMARY KEY` | UUID del farmer en backend |
| `name` | `text NOT NULL` | Nombre |
| `last_name` | `text` | Apellido |
| `document_id` | `text` | Número de documento |
| `phone` | `text` | Teléfono |
| `farm_name` | `text` | Nombre de la finca |
| `cached_at` | `integer` timestamp | Cuándo se guardó |

#### `src/storage/db/migrations/index.ts`

Agregar migración `m0002` con los dos `CREATE TABLE IF NOT EXISTS` correspondientes.

---

### Fase 2 — Storage: `pendingSessionStorage` y `farmerCacheStorage`

**Objetivo:** Crear las capas de acceso a las dos tablas nuevas.

#### `src/storage/pendingSessions.ts` — NUEVO

Módulo con las siguientes operaciones:

- `create(params: { localSessionId, campaignId, farmerId?, userId? })` — inserta con `status = 'pending'`
- `resolve(localSessionId, realSessionId)` — actualiza `real_session_id`, `status = 'resolved'`, `resolved_at`
- `markFailed(localSessionId)` — actualiza `status = 'failed'`
- `listPending()` — retorna todas las entradas con `status = 'pending'`
- `getByLocal(localSessionId)` — busca por PK
- `getByReal(realSessionId)` — busca por `real_session_id` (para lookups inversos)

Tipos a exportar:
```
PendingSessionEntry { localSessionId, campaignId, farmerId?, userId?, realSessionId?, status, createdAt, resolvedAt? }
PendingSessionStatus = 'pending' | 'resolved' | 'failed'
```

#### `src/storage/farmerCache.ts` — NUEVO

Módulo con:

- `upsert(farmer: FarmerCacheEntry)` — insert or update por `farmerId`
- `search(query: string)` — búsqueda LIKE en `name`, `last_name`, `document_id`; retorna máximo 10 resultados ordenados por `cached_at DESC`
- `get(farmerId: string)` — lookup por PK
- `listRecent(limit?: number)` — últimos N guardados (default 20)

Tipos a exportar:
```
FarmerCacheEntry { farmerId, name, lastName?, documentId?, phone?, farmName?, cachedAt }
```

La función `search` usa tres condiciones OR con LIKE `%query%` y las encadena con
Drizzle `or(...)`. Si `query` tiene menos de 2 caracteres, retorna `[]` sin consultar.

---

### Fase 3 — API / helpers: generación de ID local y detección de modo offline

**Objetivo:** Centralizar la generación de IDs locales y la función que decide si se
debe crear la sesión offline.

#### `src/lib/generateLocalId.ts` — NUEVO

Exporta una sola función:

- `generateLocalId(prefix: 'session' | 'survey' | 'farmer')` — retorna `local_<prefix>_<uuid>`

Usar `crypto.randomUUID()` (disponible en React Native 0.70+) para el UUID. No usar
`Math.random()` ni `Date.now()` — colisiones no aceptables para IDs de sesión.

#### `src/lib/isLocalId.ts` — NUEVO

Exporta:

- `isLocalId(id: string)` — retorna `true` si el id empieza con `'local_'`

Función pura, sin efectos. Usada en múltiples puntos para decidir si se debe remapar.

---

### Fase 3b — Utilidad: `extractFarmerLocally`

**Objetivo:** Construir un objeto `Farmer` provisional leyendo las respuestas de S1
desde SQLite, sin llamar al backend. Permite continuar el flujo offline inmediatamente
después de completar S1.

#### `src/lib/extractFarmerLocally.ts` — NUEVO

Firma:

```
extractFarmerLocally(s1SurveyId: string): Promise<LocalFarmerDraft | null>
```

Donde `LocalFarmerDraft` es:

```
{
  farmerId: string;        // "local_farmer_<uuid>" o farmerId real si ya está en cache
  name: string;
  lastName: string | null;
  documentId: string | null;
  phone: string | null;
  isProvisional: boolean;  // true si el farmerId es local_
}
```

**Algoritmo:**

1. Cargar el draft del survey `s1SurveyId` desde `surveyDraftStore`. Si no existe,
   retornar `null`.
2. Obtener el instrumento del `instrumentCacheStorage` por `instrumentId` del draft.
   Si no está en caché, retornar `null`.
3. Aplanar las secciones del instrumento (usando `flattenSections`) para obtener la
   lista de preguntas con sus anotaciones `systemField`.
4. Para cada pregunta con `systemField`, leer la respuesta correspondiente del draft:

   | `systemField` | Tipo de pregunta | Campo a leer |
   |---|---|---|
   | `farmer.name` | `open_text` | `textValue` |
   | `farmer.lastName` | `open_text` | `textValue` |
   | `farmer.documentId` | `open_text` / `numeric` | `textValue` \|\| `numericValue?.toString()` |
   | `farmer.phone` | `open_text` / `numeric` | `textValue` \|\| `numericValue?.toString()` |
   | `farmer.isRespondent` | `yes_no` | `booleanValue` (si `false`, el farmer es el productor, no el encuestado) |

5. Si `farmer.name` está vacío o es null, retornar `null` (no se puede construir un
   farmer sin nombre).
6. Buscar en `farmerCacheStorage` por `documentId` (si se obtuvo uno):
   - Si hay coincidencia → retornar el farmer del caché con `isProvisional: false`.
     No crear un ID nuevo; este agricultor ya existe.
   - Si no hay coincidencia → generar `farmerId = generateLocalId('farmer')`,
     retornar con `isProvisional: true`.

**Nota sobre Q9 (encuestado ≠ productor):** La pregunta con `systemField =
'farmer.isRespondent'` indica si el encuestado es el productor. Si `booleanValue ===
false`, el farmer es otra persona. En ese caso, los campos `farmer.name`, `lastName`,
etc. del instrumento S1 pueden referirse al encuestado, no al productor. La extracción
local ignora esta distinción — usa los valores disponibles. El backend, al sincronizar,
aplica la lógica correcta de Q9.

---

### Fase 4 — Store: extender `useCampaignSessionStore` para modo offline

**Objetivo:** El store debe registrar si la sesión actual es provisional y guardar el
`localSessionId` para permitir el remapeo posterior.

**Archivo:** `src/store/useCampaignSessionStore.ts`

Nuevos campos en el estado:

- `isOfflineSession: boolean` — `true` si la sesión fue creada sin red
- `localSessionId: string | null` — el ID provisional de sesión; `null` para sesiones online
- `localFarmerId: string | null` — el ID provisional del farmer; `null` si no hay farmer provisional

Nuevas acciones:

- `applyOfflineSession(localSessionId: string)` — setea `sessionId = localSessionId`,
  `isOfflineSession = true`, `localSessionId = localSessionId`
- `resolveSession(realSessionId: string)` — setea `sessionId = realSessionId`,
  `isOfflineSession = false` (se llama cuando el SyncQueueService resuelve la sesión)
- `applyLocalFarmer(draft: LocalFarmerDraft)` — setea `farmerId = draft.farmerId`,
  `farmerName = draft.name`, y si `draft.isProvisional` → `localFarmerId = draft.farmerId`
- `resolveFarmer(realFarmerId: string)` — setea `farmerId = realFarmerId`,
  `localFarmerId = null` (se llama cuando el SyncQueueService obtiene el ID real)

Sin cambios al `initialState` salvo agregar los dos campos con valores por defecto
(`false` y `null`).

---

### Fase 5 — Pre-survey: lógica offline en `pre-survey.tsx`

**Objetivo:** Los tres handlers del pre-survey deben funcionar sin red creando sesiones
provisionales.

**Archivo:** `app/campaign/[id]/pre-survey.tsx`

Renombrar `startAndNavigate` a `startSessionOnline` (sin cambios funcionales).

Agregar `startSessionOffline(options)` que:

1. Genera `localSessionId = generateLocalId('session')`.
2. Llama `store.startSession(campaign)` (resetea el store).
3. Aplica el modo de farmer: `setNewFarmerMode()`, `setSelectedFarmer()`, o nada para
   "continuar con último".
4. Llama `pendingSessionStorage.create({ localSessionId, campaignId, farmerId?, userId })`.
5. Llama `store.applyOfflineSession(localSessionId)`.
6. Navega a `/campaign/${id}/session/local_${...}/orchestrator`.

Modificar `startAndNavigate` (renombrado a `startSession`) para que:

- Si `isOnline` → llama `startSessionOnline` (comportamiento actual).
- Si `!isOnline` → llama `startSessionOffline`.

**Casos específicos por opción:**

**handleSearchSelect**: offline → usa farmer del caché local. La función recibe
`(farmerId, farmerName)` igual que antes. No cambia la firma; el llamador
(PreSurveyForm) es quien decide si busca online u offline.

**handleNewFarmer**: offline → llama `startSessionOffline({ isNew: true })`. El
orquestador detectará `injectionPhase === 's1'` y usará `injectInstrumentOffline`.

**handleContinueLast**: offline → llama `startSessionOffline({ farmerId, farmerName })`.
No hay S1/S2. El orquestador usa `getNextStepOffline`.

**Caso de error diferido para sesiones online:**

El `try/catch` existente que envuelve `createCampaignSession` no cambia para el path
online. Si hay red y falla el servidor, el mensaje de error ya se muestra (comportamiento
actual).

---

### Fase 6 — PreSurveyForm: búsqueda offline con `farmerCache`

**Objetivo:** La búsqueda de encuestados funcione offline usando el caché local.

**Archivo:** `src/components/campaign/PreSurveyForm.tsx`

Cambios al `useEffect` de búsqueda:

- Si `isOnline` y `query.trim()` → llama `searchFarmers(query)` como hoy.
- Si `!isOnline` y `query.trim()` → llama `farmerCacheStorage.search(query)` y mapea
  los resultados al tipo `FarmerSearchResult`.

Cuando el usuario selecciona un resultado del caché offline, la llamada a
`onSearchSelect` es idéntica — el cambio es transparente para el handler del padre.

Cambios visuales menores:

- Si offline y `searchOpen`, mostrar texto "Buscando en agricultores guardados" debajo
  del input.
- Si offline y sin resultados, mostrar "Este agricultor no está guardado localmente.
  Conéctate para buscarlo." en lugar del mensaje genérico actual.

El botón "Buscar encuestado" ya no se deshabilita offline — solo cambia la fuente de
resultados.

El botón "Nuevo encuestado" sí sigue habilitado offline (inicia flujo S1/S2 diferido).
Eliminar la condición `disabled={!isOnline}` de ese botón y del de búsqueda.

Actualizar la prop `isOnline` para que solo afecte los textos de ayuda, no los
`disabled`.

---

### Fase 7 — Orquestador: `injectInstrumentOffline` para sesiones provisionales

**Objetivo:** Cuando la sesión es provisional y `injectionPhase === 's1'` o `'s2'`,
el orquestador no puede llamar `createSurvey` al backend. Necesita una variante local.

**Archivo:** `app/campaign/[id]/session/[sessionId]/orchestrator.tsx`

Agregar función `injectInstrumentOffline(code: 'S1' | 'S2')`:

1. Obtiene el instrumento desde `instrumentCacheStorage` por código. Si no está en
   caché, muestra error "Instrumento no disponible offline. Descarga las campañas con
   WiFi."
2. Genera `localSurveyId = generateLocalId('survey')`.
3. Llama `surveyDraftStore.createDraft({ surveyId: localSurveyId, instrumentId, campaignSessionId: resolvedSessionId })`.
4. Encola en `syncQueue` con `campaignSessionId = resolvedSessionId` (el ID provisional).
5. Si `code === 'S1'` → `store.setInjectionS1SurveyId(localSurveyId)`.
   Si `code === 'S2'` → `store.setInjectionS2SurveyId(localSurveyId)`.
6. Inicializa `useInstrumentSurveyStore.initializeSurvey(...)`.
7. Navega a `/instrument/${instrumentId}/question/0`.

Modificar la función `injectInstrument` existente para que sea el wrapper que decide:

```
injectInstrument(code):
  if isOnline → injectInstrumentOnline(code)   // lógica actual
  else         → injectInstrumentOffline(code)
```

**Cambio en la fase post-S1:**

En el bloque `injectionPhase === 's1'` con `s1SurveyId` ya existente (retorno del
instrumento completado):

```
if (isOnline) {
  // Flujo actual — sin cambios
  SyncQueueService.processSurveyNow(s1SurveyId)
  extractFarmer(s1SurveyId) → farmer
  store.completeS1Injection(farmer.farmerId, farmer.name)
  store.setLastFarmer(farmer)
  injectInstrument('S2')         // online → injectInstrumentOnline
} else {
  // Nuevo flujo offline
  const draft = await extractFarmerLocally(s1SurveyId)
  if (draft) {
    if (draft.isProvisional) {
      farmerCacheStorage.upsert(draft)  // guardar provisional en caché
    }
    store.applyLocalFarmer(draft)
    store.completeS1Injection(draft.farmerId, draft.name)
    injectInstrument('S2')             // offline → injectInstrumentOffline
  } else {
    // S1 no tiene respuestas suficientes (farmer.name vacío)
    setScreenState('offline_extraction_pending')
    // Fallback: "No se pudo identificar. Conecta o continúa sin identificar."
  }
}
```

`offline_extraction_pending` se mantiene como **estado de fallback** (solo cuando la
extracción local falla), no como el camino habitual. Muestra:
- Mensaje: "No se pudo leer los datos del encuestado. Conéctate para continuar."
- Botón "Reintentar"
- Botón "Continuar sin identificar" → `store.completeS2Injection()` + flujo normal

**Cambio en la fase post-S2:**

En el bloque `injectionPhase === 's2'` con `s2SurveyId` ya existente:

```
if (isOnline) {
  // Flujo actual — sin cambios
  SyncQueueService.processSurveyNow(s2SurveyId)
  extractCrops(s2SurveyId)
  store.completeS2Injection()
  getNextStep → checkAndNavigate
} else {
  // Offline: omitir extractCrops, continuar directamente
  store.completeS2Injection()
  getNextStepOffline → navigate
}
```

No hay extracción local de cultivos (ver D9). El encuestador continúa al primer paso
real de la campaña sin bloqueo.

---

### Fase 8 — SyncQueueService: resolución de sesiones provisionales

**Objetivo:** Al procesar la cola, el servicio detecta y resuelve `sessionId`s
provisionales antes de enviar respuestas.

**Archivo:** `src/sync/SyncQueueService.ts`

Agregar método privado `resolveLocalSessions()`:

1. Llama `pendingSessionStorage.listPending()`.
2. Para cada entrada:
   a. Si `farmerId` es provisional (`isLocalId(farmerId)`):
      - Buscar el farmer provisional en `farmerCache` por `farmerId` local.
      - Pasar `farmerId: null` al `createCampaignSession` (el backend lo asignará
        al hacer `extractFarmer` después). El `localFarmerId` se resuelve en la Fase 9.
   b. Llama `createCampaignSession({ campaignId, farmerId: realFarmerIdOrNull, userId })`.
   c. Obtiene `realSessionId`.
   d. Actualiza todas las filas de `surveys` donde `campaignSessionId = localSessionId`
      → `realSessionId`.
   e. Actualiza todas las filas de `syncQueue` donde `campaignSessionId = localSessionId`
      → `realSessionId`.
   f. Llama `pendingSessionStorage.resolve(localSessionId, realSessionId)`.
   g. Llama `store.resolveSession(realSessionId)` si el store tiene esa sesión activa.
3. Si alguna entrada falla (red), la deja en `pending` y continúa con las demás.
4. Si una entrada falla con 4xx (campaña inválida, etc.) → `markFailed` + loguear.

Llamar `resolveLocalSessions()` al inicio de `processAll()`, antes del loop principal,
solo si hay red.

**Nota:** Los updates masivos de `surveys` y `syncQueue` se hacen con Drizzle
`update(...).where(eq(column, localId))`. No requieren transacción explícita porque
son idempotentes — si falla a mitad, la próxima ejecución reintenta desde cero.

---

### Fase 9 — SyncQueueService: `extractFarmer`/`extractCrops` diferidos

**Objetivo:** Cuando se resuelven sesiones de tipo "nuevo encuestado" (las que tenían
S1/S2 pendientes), ejecutar `extractFarmer` y `extractCrops` automáticamente después
de sincronizar las respuestas correspondientes.

**Archivo:** `src/sync/SyncQueueService.ts`

Agregar método privado `maybeExtractFarmerAndCrops(entry: SyncQueueEntry)`:

1. Carga el draft de `entry.surveyId` y obtiene su `instrumentId`.
2. Consulta `instrumentCacheStorage` para saber si ese instrumento tiene `code === 'S1'`
   o `'S2'`. Si no es S1 ni S2, retorna inmediatamente sin hacer nada.
3. Si es S1:
   - Llama `extractFarmer(entry.surveyId)` → `{ farmer }` con `farmer.farmerId` real.
   - **Remapeo de farmerId provisional:**
     - Consultar `farmerCache` para detectar si existe una entrada con prefijo
       `local_farmer_` que tenga el mismo `documentId` que el farmer devuelto.
     - Si existe (`localFarmerId`):
       - Actualizar `farmerCache`: reemplazar `farmerId = localFarmerId` por
         `farmerId = farmer.farmerId`.
       - Si el store tiene `localFarmerId` activo → llamar
         `store.resolveFarmer(farmer.farmerId)`.
   - Llama `farmerCacheStorage.upsert(farmer)` con el ID real.
   - Llama `secureStorage.saveLastFarmer(farmer)` para actualizar `lastFarmer`.
4. Si es S2:
   - Llama `extractCrops(entry.surveyId)` (resultado no se cachea localmente).
5. Si falla (red caída nuevamente), propaga el error. El caller (`processEntry`)
   reintenta con backoff.

Llamar `maybeExtractFarmerAndCrops(entry)` dentro de `processEntry`, justo después de
`submitResponsesBatch` y antes de `markSurveyAsSynced`.

**Importante:** El código ya guarda el `instrumentId` en la tabla `surveys`. Para saber
si un instrumento es S1 o S2, se necesita que el `instrumentCache` guarde el campo
`code`. Verificar en `instrumentCacheStorage.get()` si el `InstrumentResponse` retornado
incluye `code`. Según `src/types/instrument.ts`, `code` ya existe como campo opcional
(`code?: string | null`) en `InstrumentResponse`. El caché ya lo persiste en JSON.

---

### Fase 10 — Alimentar `farmerCache` desde flujos existentes

**Objetivo:** El caché de farmers se puebla automáticamente en los momentos adecuados.

**Puntos de escritura:**

#### `app/campaign/[id]/pre-survey.tsx`

En `handleSearchSelect`, después de que el usuario selecciona un resultado de búsqueda
online, llamar `farmerCacheStorage.upsert(farmer)` con los datos del resultado antes
de navegar. Esto asegura que cualquier farmer buscado online queda disponible offline.

#### `src/sync/SyncQueueService.ts` (ya cubierto en Fase 9)

`extractFarmer` llama `farmerCacheStorage.upsert()` automáticamente.

**No se implementa** sincronización masiva de farmers desde el backend al descargar
campañas. El caché se alimenta de forma lazy, solo con farmers que el encuestador ya
conoce. Esto es suficiente para el caso de uso real (retomar con agricultores ya
visitados).

---

### Fase 11 — Ajustes menores y limpieza

**Objetivo:** Pequeños ajustes para mantener consistencia y evitar regresiones.

#### `app/_layout.tsx`

El `useEffect` que corre tras `dbReady = true` ya llama:
- `syncQueueStorage.resetInFlightToRetry()`
- `store.loadLastFarmer()`

Agregar: `pendingSessionStorage.listPending()` para loguear cuántas sesiones offline
quedaron pendientes del ciclo anterior. Solo informativo — el SyncQueueService las
resuelve al conectar.

#### `src/storage/surveyDraftStore.ts`

En `createDraft`, el parámetro `campaignSessionId` ya puede recibir un ID provisional
(`local_...`). No requiere cambio funcional — ya es `string | undefined`. Solo
documentar con comentario que puede ser provisional.

#### `src/sync/NetworkMonitor.ts`

Verificar que `processAll()` se dispara correctamente al reconectar. No se espera
cambio, pero confirmar que el flujo `resolveLocalSessions → processEntry → extract`
se encadena en orden. Si `resolveLocalSessions` lanza excepción total, `processAll`
no debe bloquearse — envolver en `try/catch` y loguear.

---

## Tabla resumen de archivos

| Fase | Archivo | Acción |
|------|---------|--------|
| 1 | `src/storage/db/schema.ts` | Agregar tablas `pendingSessions` y `farmerCache` |
| 1 | `src/storage/db/migrations/index.ts` | Agregar migración `m0002` con los dos `CREATE TABLE` |
| 2 | `src/storage/pendingSessions.ts` | CREAR — CRUD de sesiones provisionales |
| 2 | `src/storage/farmerCache.ts` | CREAR — upsert + búsqueda offline de farmers |
| 3 | `src/lib/generateLocalId.ts` | CREAR — genera IDs con prefijo `local_` (session, survey, farmer) |
| 3 | `src/lib/isLocalId.ts` | CREAR — detecta si un ID es provisional |
| 3b | `src/lib/extractFarmerLocally.ts` | CREAR — extrae farmer provisional de respuestas S1 en SQLite |
| 4 | `src/store/useCampaignSessionStore.ts` | Agregar `isOfflineSession`, `localSessionId`, `localFarmerId`, `applyOfflineSession`, `resolveSession`, `applyLocalFarmer`, `resolveFarmer` |
| 5 | `app/campaign/[id]/pre-survey.tsx` | Agregar `startSessionOffline`; bifurcar por `isOnline` |
| 6 | `src/components/campaign/PreSurveyForm.tsx` | Búsqueda offline con `farmerCache`; quitar `disabled` de botones |
| 7 | `app/campaign/[id]/session/[sessionId]/orchestrator.tsx` | Agregar `injectInstrumentOffline`; llamar `extractFarmerLocally` post-S1; estado `offline_extraction_pending` solo como fallback; omitir `extractCrops` post-S2 offline |
| 8 | `src/sync/SyncQueueService.ts` | Agregar `resolveLocalSessions()` con manejo de `localFarmerId`; llamarlo al inicio de `processAll()` |
| 9 | `src/sync/SyncQueueService.ts` | Agregar `maybeExtractFarmerAndCrops()` con remapeo de `local_farmer_` → ID real; llamarlo en `processEntry()` |
| 10 | `app/campaign/[id]/pre-survey.tsx` | Upsert en `farmerCache` al seleccionar resultado online |
| 11 | `app/_layout.tsx` | Log de sesiones pendientes al arrancar |
| 11 | `src/storage/surveyDraftStore.ts` | Comentario documental (sin cambio funcional) |
| 11 | `src/sync/NetworkMonitor.ts` | Verificar que `processAll` no se rompe si `resolveLocalSessions` falla |

---

## Flujos resultado (cómo queda el UX)

### Opción A — Buscar encuestado offline

1. Encuestador escribe en el buscador → `farmerCacheStorage.search()` responde
   instantáneamente.
2. Selecciona farmer → `handleSearchSelect(farmerId, farmerName)` → `startSessionOffline`.
3. Navega al orquestador con `sessionId` provisional → `getNextStepOffline` calcula el
   primer paso → encuestador responde.
4. Al reconectar: `resolveLocalSessions` → crea sesión real → remapea IDs → `processAll`
   envía respuestas.

### Opción B — Nuevo encuestado offline

1. Encuestador pulsa "Nuevo encuestado" → `startSessionOffline({ isNew: true })`.
2. Orquestador detecta `injectionPhase === 's1'` y `!isOnline` →
   `injectInstrumentOffline('S1')` → navega a S1.
3. Responde S1 → vuelve al orquestador → `injectionPhase === 's1'` con `s1SurveyId`
   existente → `!isOnline` → llama `extractFarmerLocally(s1SurveyId)`.
4. Si la extracción local tiene éxito: `store.applyLocalFarmer(draft)` →
   `store.completeS1Injection(...)` → `injectInstrumentOffline('S2')` → navega a S2.
5. Responde S2 → vuelve al orquestador → `injectionPhase === 's2'` con `s2SurveyId`
   existente → `!isOnline` → `store.completeS2Injection()` → `getNextStepOffline` →
   primer paso real de la campaña. El encuestador continúa sin bloqueo.
6. Al reconectar: `resolveLocalSessions` → crea sesión real → remapea `sessionId` →
   `processAll` envía S1 → `maybeExtractFarmerAndCrops` ejecuta `extractFarmer` real
   → remapta `local_farmer_<uuid>` al ID real → `farmerCache` y `lastFarmer`
   actualizados → envía S2 → `extractCrops` real.

### Opción C — Continuar con último encuestado offline

1. Encuestador pulsa "Continuar con [Nombre]" → `startSessionOffline({ farmerId,
   farmerName })`.
2. Orquestador con `injectionPhase === 'none'` → `getNextStepOffline` → primer paso.
3. Encuestador responde normalmente.
4. Al reconectar: idéntico a Opción A desde el paso 4.

---

## Advertencias para el implementador

1. **`crypto.randomUUID()` en React Native 0.81:** Verificar que esté disponible en
   el entorno. Si no, usar el paquete `uuid` ya instalado como fallback. No usar
   implementaciones basadas en `Math.random`.

1b. **`extractFarmerLocally` y Q9:** Si el encuestado no es el productor (`farmer.isRespondent
   = false`), la extracción local captura los datos del encuestado como si fuera el
   farmer. El backend corrige esto al sincronizar. No es un bug — es una limitación
   documentada del modo offline. El nombre que verá el encuestador en pantalla durante
   la sesión offline puede ser el del encuestado, no el del productor real.

2. **Migración Drizzle:** Después de editar `schema.ts`, ejecutar
   `pnpm drizzle-kit generate` y verificar que el SQL generado coincide con el diseño
   antes de integrarlo manualmente al `migrations/index.ts`. Las migraciones de
   expo-sqlite se aplican manualmente, no automáticamente.

3. **`sessionId` como parámetro de ruta en expo-router:** La ruta
   `/campaign/[id]/session/[sessionId]/orchestrator` usa `sessionId` como segmento
   dinámico. Un ID provisional `local_session_123` es un string válido para expo-router.
   No requiere cambios en el routing.

4. **Remapeo masivo en `resolveLocalSessions`:** Los updates en `surveys` y `syncQueue`
   afectan potencialmente múltiples filas. Usar `eq(surveys.campaignSessionId,
   localSessionId)` con Drizzle. Si la tabla `surveys` crece mucho, este update puede
   ser lento; se acepta para MVP porque el número de respuestas por sesión es acotado.

5. **`farmerCache` vs `lastFarmer` en SecureStorage:** Son dos mecanismos distintos.
   `lastFarmer` en SecureStorage es un singleton (un solo farmer, el más reciente).
   `farmerCache` en SQLite es una colección queryable. La opción C sigue usando
   `lastFarmer`. La opción A usa `farmerCache`. No unificarlos — sirven propósitos
   distintos.

6. **Sesiones `failed` en `pending_sessions`:** Si `createCampaignSession` responde
   con 4xx (e.g. la campaña ya no existe), la sesión se marca `failed`. Las respuestas
   del encuestador quedan huérfanas en `syncQueue` y pasan a `failed_validation` al
   intentar enviarlas sin `campaignSessionId` real. Informar al encuestador con un
   mensaje en la pantalla de sincronización. No está en scope del Spec 20 el manejo
   UX de este caso extremo.

7. **Instrumentos S1/S2 y su `code`:** `instrumentCacheStorage` guarda el JSON
   completo de `InstrumentResponse`, que incluye `code?: string | null`. En la Fase 9,
   al detectar si un survey corresponde a S1 o S2, se lee `instrument.code` del caché.
   Si el caché no tiene el instrumento (borrado por alguna razón), `maybeExtractFarmerAndCrops`
   no puede determinar el código y debe saltar el paso sin error fatal — loguear warning.
