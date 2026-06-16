# Spec 19: Mejoras post-lanzamiento — App Mobile SOSAgro

Spec acumulativo para mejoras identificadas durante el uso real de la aplicación.
Cada mejora es independiente y puede implementarse por separado.

---

## Mejora 1 — Limpieza automática de encuestas sincronizadas

### Problema

Las encuestas con `status = 'synced'` y sus respuestas asociadas permanecen
indefinidamente en la base de datos SQLite del dispositivo. No existe ningún
mecanismo que las elimine una vez que han sido transferidas al backend
exitosamente.

En un dispositivo que opere durante varias semanas de trabajo de campo, la tabla
`responses` puede acumular miles de filas que ya no tienen valor operativo, lo
que degrada el rendimiento de las consultas y ocupa espacio innecesario.

### Solución propuesta

Implementar una función de limpieza (`purgeSyncedSurveys`) en `surveyDraftStore`
que elimine encuestas sincronizadas con más de N días de antigüedad, y ejecutarla
automáticamente en dos momentos:

1. Al arrancar la app (después de que `dbReady = true`), para limpiar acumulación
   histórica.
2. Opcionalmente, como acción manual desde la pantalla de Sincronización.

### Criterio de elegibilidad para borrado

Una encuesta es elegible si cumple **todas** las condiciones:

- `status = 'synced'`
- `updatedAt` tiene más de **30 días** de antigüedad

El umbral de 30 días da margen para que el supervisor o el coordinador pueda
verificar datos en el dispositivo antes de que desaparezcan localmente.

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/storage/surveyDraftStore.ts` | Agregar `purgeSyncedSurveys(olderThanDays?: number): Promise<number>` — retorna la cantidad de encuestas eliminadas |
| `app/_layout.tsx` | Llamar `purgeSyncedSurveys()` después de `syncQueueStorage.resetInFlightToRetry()` en el `useEffect` de `dbReady` |
| `app/(tabs)/sync/index.tsx` | (Opcional) Agregar botón "Limpiar historial" que invoque la función y muestre cuántos registros se eliminaron |

### Notas de implementación

- La eliminación de la fila en `surveys` borra automáticamente las filas de
  `responses` por la restricción `CASCADE DELETE` ya definida en el esquema.
- La función debe ejecutarse silenciosamente en background (sin bloquear UI).
  Solo loguear el resultado con `logger.info`.
- El umbral de 30 días debe ser el valor por defecto del parámetro
  `olderThanDays`; pasar un valor distinto facilita pruebas.
- No eliminar encuestas con `status = 'draft'` o `'completed'` bajo ninguna
  circunstancia.

### Query Drizzle

```typescript
const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
const result = await db
  .delete(surveys)
  .where(
    and(
      eq(surveys.status, 'synced'),
      lt(surveys.updatedAt, cutoff)
    )
  );
```

---

## Mejora 2 — Pre-encuesta con S1/S2: identificación del encuestado vía instrumentos

### Contexto

La plataforma web (Spec 23 + Spec 02) ya implementa el flujo donde los instrumentos S1
("Identificación del Encuestado") y S2 ("Cultivos") se aplican al inicio de cada campaña
cuando el encuestador elige "Nuevo encuestado". El backend extrae automáticamente las
entidades `Farmer`, `Farm` y cultivos de las respuestas, sin necesidad de un formulario
inline.

La app mobile actualmente usa un enfoque distinto: `PreSurveyForm` presenta un formulario
con dos modos (`search` / `create`) donde el encuestador ingresa manualmente los datos del
productor antes de comenzar la campaña. Este formulario es extenso, propenso a errores y
no aprovecha la lógica de deduplicación de farmers ni el mapeo condicional encuestado/
productor (Q9) que el backend ya implementa.

Esta mejora reemplaza el formulario inline por el mismo flujo S1/S2 que usa la web.

---

### Comportamiento esperado

1. El encuestador abre una campaña y ve la pantalla de pre-encuesta con tres opciones:

   - **Buscar encuestado** — input con debounce → lista de resultados del servidor → al
     seleccionar, crea la sesión con ese `farmerId` y navega al orquestador.
   - **Nuevo encuestado** — crea la sesión sin `farmerId` → inyecta S1 como primer
     instrumento → al completar S1 llama `extract-farmer` → inyecta S2 → al completar
     S2 llama `extract-crops` → continúa con el flujo normal de `getNextStep`.
   - **Continuar con [Nombre]** *(visible solo si existe un `lastFarmer` guardado)* —
     crea la sesión con ese `farmerId` y navega al orquestador sin pasar por S1/S2.

2. Enlace **"Continuar sin identificar encuestado"** siempre visible como salida de
   emergencia.

3. Las opciones "Buscar encuestado" y "Nuevo encuestado" requieren conectividad. Si el
   dispositivo está offline, se deshabilitan con un aviso. "Continuar con el último
   encuestado" puede usarse offline si el `farmerId` está guardado localmente.

---

### Restricciones

- S1 y S2 **no son pasos regulares de la campaña**; no aparecen en la respuesta de
  `getNextStep`. El orquestador los inyecta de forma especial antes de entrar al flujo
  normal.
- La lógica de Q9 (encuestado ≠ productor) y deduplicación de farmers ya está en el
  backend (Spec 02). La app mobile no necesita implementarla — solo llama a
  `extract-farmer` y el backend se encarga.
- Si el backend no tiene S1 o S2 configurados con `code`, el flujo debe degradar
  gracefully: mostrar un error y ofrecer "Continuar sin identificar".
- S1 y S2 deben descargarse y cachearse durante el `refresh()` de campañas, igual que
  los demás instrumentos.

---

### Fases de implementación

#### Fase 1 — Capa API: nuevos endpoints y tipos

**Archivos a crear/modificar:**

| Archivo | Cambio |
|---|---|
| `src/api/endpoints.ts` | Agregar 4 nuevas entradas |
| `src/api/farmers.ts` | Crear: `searchFarmers`, `extractFarmer`, `extractCrops` |
| `src/api/campaignSessions.ts` | Agregar: `getLastFarmer` |
| `src/api/instruments.ts` | Crear (o modificar): `fetchInstrumentByCode` |
| `src/types/farmer.ts` | Crear: tipos `FarmerSearchResult`, `ExtractFarmerResult`, `ExtractCropsResult`, `LastFarmerResult` |

**Nuevas entradas en `endpoints.ts`:**

```typescript
farmersSearch: '/api/farmers/search',
surveyExtractFarmer: (id: string) => `/api/surveys/${id}/extract-farmer`,
surveyExtractCrops:  (id: string) => `/api/surveys/${id}/extract-crops`,
instrumentByCode:    (code: string) => `/api/instruments/by-code/${code}`,
campaignSessionLastFarmer: '/api/campaign-sessions/last-farmer',
```

**Tipos nuevos en `src/types/farmer.ts`:**

```typescript
export interface FarmerSearchResult {
  farmerId: string;
  name: string;
  lastName: string | null;
  documentId: string | null;
  phone: string | null;
  farm?: { name: string } | null;
}

export interface ExtractFarmerResult {
  farmer: FarmerSearchResult;
  existed: boolean;
}

export interface ExtractCropsResult {
  crops: Array<{ typeOfCropId: string; name: string }>;
}

export type LastFarmerResult = {
  farmerId: string;
  name: string;
  lastName: string | null;
  farm?: { name: string } | null;
} | null;
```

**`src/api/farmers.ts`:**

```typescript
searchFarmers(query: string): Promise<FarmerSearchResult[]>
  → GET /api/farmers/search?q={query}

extractFarmer(surveyId: string): Promise<ExtractFarmerResult>
  → POST /api/surveys/{surveyId}/extract-farmer   (body: {})

extractCrops(surveyId: string): Promise<ExtractCropsResult>
  → POST /api/surveys/{surveyId}/extract-crops   (body: {})
```

**En `src/api/campaignSessions.ts` — agregar:**

```typescript
getLastFarmer(): Promise<LastFarmerResult>
  → GET /api/campaign-sessions/last-farmer
```

**`src/api/instruments.ts` — agregar o crear:**

```typescript
fetchInstrumentByCode(code: 'S1' | 'S2'): Promise<{ instrumentId: string; name: string }>
  → GET /api/instruments/by-code/{code}
```

---

#### Fase 2 — Store: extender `useCampaignSessionStore`

**Archivo:** `src/store/useCampaignSessionStore.ts`

**Nuevos campos en el estado:**

```typescript
// Identificación del encuestado
farmerId: string | null;
farmerName: string | null;
isNewFarmer: boolean;           // true → inyectar S1/S2

// S1/S2 injection tracking
injectionPhase: 'none' | 's1' | 's2';
s1SurveyId: string | null;      // surveyId creado para S1
s2SurveyId: string | null;      // surveyId creado para S2

// Último encuestado (persistido en SecureStorage)
lastFarmer: LastFarmerResult;
```

**Nuevas acciones:**

```typescript
setNewFarmerMode(): void
  // isNewFarmer = true, injectionPhase = 's1', farmerId = null

setSelectedFarmer(farmerId: string, farmerName: string): void
  // isNewFarmer = false, injectionPhase = 'none'

setInjectionS1SurveyId(surveyId: string): void
setInjectionS2SurveyId(surveyId: string): void

completeS1Injection(farmerId: string, farmerName: string): void
  // injectionPhase = 's2', farmerId = farmerId, farmerName = farmerName

completeS2Injection(): void
  // injectionPhase = 'none'

setLastFarmer(farmer: LastFarmerResult): void
  // actualiza estado + persiste en SecureStorage

loadLastFarmer(): Promise<void>
  // lee de SecureStorage y popula lastFarmer
```

**Persistencia de `lastFarmer`:**
Guardar en `SecureStorage` bajo la clave `'sosagro_last_farmer'` como JSON.
Cargar en `loadLastFarmer()` al inicializar el store (llamar desde `app/_layout.tsx`
tras `restoreSession()`).

---

#### Fase 3 — Pre-encuesta: reescribir `PreSurveyForm` y la pantalla

**Archivo:** `src/components/campaign/PreSurveyForm.tsx`

Reemplazar el formulario de dos modos por una UI de tres botones más búsqueda:

```
┌─────────────────────────────────┐
│  ¿Quién es el encuestado?       │
│                                 │
│  [🔍 Buscar encuestado]         │  → despliega input + lista de resultados
│                                 │
│  [+ Nuevo encuestado]           │  → solo botón, sin formulario inline
│                                 │
│  [▶ Continuar con Juan Pérez]   │  → visible solo si lastFarmer existe
│                                 │
│  ─────────────────────────────  │
│  Continuar sin identificar      │  → enlace de texto discreto
└─────────────────────────────────┘
```

**Props del nuevo componente:**

```typescript
interface PreSurveyFormProps {
  lastFarmer: LastFarmerResult;
  isOnline: boolean;
  onSearchSelect: (farmerId: string, farmerName: string) => void;
  onNewFarmer: () => void;
  onContinueLast: (farmerId: string, farmerName: string) => void;
  onSkip: () => void;
}
```

**Búsqueda de encuestado:**
- Input con debounce 300 ms llama a `searchFarmers(query)`.
- Requiere online; botón deshabilitado con mensaje si offline.
- Muestra nombre, documento y finca en cada resultado.
- Al seleccionar → llama `onSearchSelect(farmerId, farmerName)`.

**"Nuevo encuestado":**
- Requiere online.
- Solo llama `onNewFarmer()` — no muestra ningún formulario.

**"Continuar con el último encuestado":**
- Visible si `lastFarmer !== null`.
- Funciona offline.
- Muestra nombre del farmer: `Continuar con {lastFarmer.name}`.

**Archivo de pantalla:** `app/campaign/[id]/pre-survey.tsx`

Reemplazar el `onSubmit` actual por cuatro handlers:

```typescript
handleSearchSelect(farmerId, farmerName):
  store.setSelectedFarmer(farmerId, farmerName)
  createCampaignSession({ campaignId, farmerId })
  applySessionResponse(response)
  router.replace(`/campaign/${campaignId}/session/${sessionId}/orchestrator`)

handleNewFarmer():
  store.setNewFarmerMode()
  createCampaignSession({ campaignId })           // sin farmerId
  applySessionResponse(response)
  router.replace(`/campaign/${campaignId}/session/${sessionId}/orchestrator`)

handleContinueLast(farmerId, farmerName):
  store.setSelectedFarmer(farmerId, farmerName)
  createCampaignSession({ campaignId, farmerId })
  applySessionResponse(response)
  router.replace(`/campaign/${campaignId}/session/${sessionId}/orchestrator`)

handleSkip():
  createCampaignSession({ campaignId })           // sin farmerId
  applySessionResponse(response)
  router.replace(`/campaign/${campaignId}/session/${sessionId}/orchestrator`)
```

---

#### Fase 4 — Orquestador: inyección de S1/S2 y hooks de extracción

**Archivo:** `app/campaign/[id]/session/[sessionId]/orchestrator.tsx`

El orquestador ya maneja la lógica de `getNextStep`. Extenderlo para:

**Al montar, leer `injectionPhase` del store:**

```
injectionPhase === 's1'  →  iniciar inyección S1
injectionPhase === 's2'  →  iniciar inyección S2
injectionPhase === 'none' →  flujo normal: getNextStep
```

**Flujo de inyección S1:**

```typescript
async injectS1():
  1. fetchInstrumentByCode('S1') → obtener s1InstrumentId
  2. Si S1 no está en caché → downloadAndCache(s1InstrumentId)
  3. createSurvey({ instrumentId: s1InstrumentId, campaignSessionId: sessionId })
     → surveyId
  4. store.setInjectionS1SurveyId(surveyId)
  5. useInstrumentSurveyStore.initializeSurvey({ surveyId, instrumentId: s1InstrumentId,
       instrumentName: 'Identificación del Encuestado',
       sections: instrument.sections,
       campaignSessionId: sessionId })
  6. router.push(`/instrument/${s1InstrumentId}/question/0`)
```

**Al volver al orquestador con `injectionPhase === 's1'`:**
(El instrument completed screen ya navega de vuelta al orquestador)

```typescript
async afterS1():
  1. extractFarmer(store.s1SurveyId) → { farmer, existed }
  2. store.completeS1Injection(farmer.farmerId, farmer.name)
  3. store.setLastFarmer(farmer)     // persiste como último encuestado
  4. → iniciar inyección S2
```

**Flujo de inyección S2:** igual que S1 pero con `'S2'` / `s2SurveyId`.

**Al volver al orquestador con `injectionPhase === 's2'`:**

```typescript
async afterS2():
  1. extractCrops(store.s2SurveyId)
  2. store.completeS2Injection()
  3. → flujo normal: getNextStep
```

**Manejo de errores en inyección:**
Si `fetchInstrumentByCode` falla (S1/S2 no configurados en el backend), mostrar
error con opciones:
- "Reintentar"
- "Continuar sin identificar" (llama `store.completeS2Injection()` directamente
  para saltarse ambas inyecciones y entrar al flujo normal)

---

#### Fase 5 — Caché: incluir S1/S2 en el refresh

**Archivo:** `src/store/useCachedCampaignsStore.ts`

Agregar una **Fase 3** al método `refresh()` que descarga S1 y S2 si no están cacheados:

```typescript
// Fase 3 (nueva): pre-cachear S1 y S2
for (const code of ['S1', 'S2'] as const) {
  try {
    const meta = await fetchInstrumentByCode(code);
    if (!await instrumentCacheStorage.get(meta.instrumentId)) {
      const instrument = await fetchInstrumentRender(meta.instrumentId);
      await instrumentCacheStorage.save(instrument);
    }
  } catch {
    // S1/S2 no configurados en el backend — ignorar silenciosamente
  }
}
```

Esto garantiza que, incluso si el encuestador pierde conectividad justo al entrar al
flujo de "Nuevo encuestado", las preguntas de S1/S2 ya están disponibles localmente.

> Nota: `extract-farmer` y `extract-crops` sí requieren online (son llamadas al backend).
> El beneficio del caché es que las preguntas se pueden responder offline y enviar
> como parte del sync queue normal; la extracción se posterga hasta tener red.

---

#### Fase 6 — Eliminación del formulario inline

Una vez que Fases 1–5 estén implementadas y verificadas:

- Eliminar el modo `create` completo de `PreSurveyForm` (campos nombre, apellido,
  documento, teléfono, finca, departamento, municipio, vereda, coordenadas, cultivos).
- Eliminar los tipos `PreSurveyFormData.name`, `lastName`, `documentId`, etc.
  Simplificar `PreSurveyFormData` a solo `{ mode, selectedFarmerId, farmerName }`.
- Eliminar la llamada a `createCampaignSession` con payload de farmer inline.
- Eliminar imports de servicios no usados (departamentos, municipios, cultivos desde
  el formulario).

---

### Resumen de archivos a crear o modificar

| Fase | Archivo | Tipo de cambio |
|---|---|---|
| 1 | `src/api/endpoints.ts` | Agregar 5 endpoints |
| 1 | `src/api/farmers.ts` | Crear: `searchFarmers`, `extractFarmer`, `extractCrops` |
| 1 | `src/api/instruments.ts` | Agregar `fetchInstrumentByCode` |
| 1 | `src/api/campaignSessions.ts` | Agregar `getLastFarmer` |
| 1 | `src/types/farmer.ts` | Crear tipos |
| 2 | `src/store/useCampaignSessionStore.ts` | Nuevos campos + acciones de inyección y farmer |
| 2 | `src/storage/secureStorage.ts` | Agregar clave `lastFarmer` |
| 3 | `src/components/campaign/PreSurveyForm.tsx` | Reescribir: 3 botones + búsqueda |
| 3 | `app/campaign/[id]/pre-survey.tsx` | Reemplazar `onSubmit` por 4 handlers |
| 4 | `app/campaign/[id]/session/[sessionId]/orchestrator.tsx` | Inyección S1/S2 + hooks de extracción |
| 5 | `src/store/useCachedCampaignsStore.ts` | Fase 3 en `refresh()` |
| 6 | `src/components/campaign/PreSurveyForm.tsx` | Eliminar modo create inline |
| 6 | `src/types/campaign.ts` | Simplificar `PreSurveyFormData` |

---

<!-- Las siguientes mejoras se agregarán durante el desarrollo de esta conversación -->
