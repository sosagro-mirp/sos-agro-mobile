# spec21 — Evaluación offline de condiciones de paso basadas en cultivo (S2 metadata)

## Objetivo

Que `getNextStepOffline` pueda evaluar condiciones de tipo `crop` cuando el dispositivo está offline, de forma que la navegación entre instrumentos respete las condiciones de cultivo sin necesidad de conectividad — incluso cuando S2 fue completado offline.

## Contexto

Los pasos de una campaña pueden tener condiciones de visibilidad de dos tipos:

| `conditionType` | Evalúa si... |
|---|---|
| `crop` | El cultivo de S2 está registrado en la sesión |
| `question` | La respuesta a una pregunta previa tiene un valor específico |

El frontend web delega ambas al backend (server-side en `getNextStep()`). La app mobile actualmente ignora todas las condiciones offline, navegando en orden declarativo. Esto genera dos problemas concretos:

1. **Instrumentos que no aplican se muestran:** si el agricultor cultiva solo café, los instrumentos condicionales a cacao/cannabis/cáñamo se presentan igualmente.
2. **Instrumentos que sí aplican se saltan incorrectamente:** cuando hay condiciones de tipo `crop` sin datos locales, la evaluación falla conservadoramente o no se realiza.

En zonas rurales con conectividad limitada o nula — que es el contexto principal de uso de la app — este problema ocurre frecuentemente.

### Cómo funciona `extractCrops` en el backend

El backend determina los cultivos de una sesión leyendo las respuestas del instrumento S2. Las preguntas de cultivo en S2 tienen `systemField = 'crop.<nombre>'` (ej: `'crop.café'`, `'crop.cacao'`). Son de tipo `yes_no`: si la respuesta es `true`, el agricultor trabaja ese cultivo. El backend busca en `TypeOfCrop` por nombre para obtener el `cropId` correspondiente.

El tipo `InstrumentQuestion` en mobile ya incluye `systemField?: string | null`, por lo que mobile tiene la información necesaria para replicar esta lógica — pero le falta el mapeo `nombre → cropId`, que es un dato de catálogo que hoy no se descarga.

### Cuatro brechas actuales

**Brecha 1 — Tipos incompletos en el endpoint render:**
`GET /api/campaigns/:id/render` devuelve pasos con la estructura legacy:
```
{ stepId, order, instrument, conditionQuestion, conditionValue }
```
El backend tiene condiciones completas en la tabla `step_conditions` (con `conditionType`, `conditionCrop`, `logicalOperator`, etc.) que no se serializan en este endpoint.

**Brecha 2 — Catálogo de cultivos no disponible localmente:**
El mapeo `nombre → cropId` vive en la tabla `type_of_crops` del backend. Mobile no lo descarga, por lo que no puede resolver `'crop.café'` → `cropId` sin conexión.

**Brecha 3 — Cultivos de S2 no persisten localmente:**
Cuando se completa S2 online, `extractCrops(s2SurveyId)` obtiene `CropSummary[]` del backend. El resultado se descarta — no se guarda en SQLite. Cuando S2 se hace offline, tampoco se extrae nada hasta sincronizar.

**Brecha 4 — `getNextStepOffline` ignora condiciones:**
La función navega en orden declarativo ignorando todas las condiciones. El tipo `CampaignStepRender` ni siquiera incluye el array completo de condiciones.

## Alcance

**Dentro del scope:**
- Condiciones de tipo `crop` — se evalúan offline en todos los casos (S2 online y S2 offline).
- Catálogo de cultivos incluido en la descarga de campaña.
- Persistencia de cropIds por sesión en SQLite.
- Extracción local de cultivos desde respuestas SQLite de S2 (cuando S2 fue offline).
- Extensión del endpoint render para incluir `conditions[]` completo y `availableCrops`.

**Fuera del scope:**
- Condiciones de tipo `question` offline — no se evalúan. Se tratan como `true` (política conservadora: mejor mostrar un instrumento de más que saltárselo; el backend re-evalúa al sincronizar con los datos reales).

---

## Fases de implementación

### Fase 1 — Backend: extender endpoint render

**Objetivo:** que `GET /api/campaigns/:id/render` incluya (a) el array `conditions[]` completo en cada paso y (b) el catálogo de cultivos disponibles.

#### 1a — Condiciones completas por paso

Estructura nueva de cada condición dentro de un paso:
```
{
  conditionId: string
  order: number
  logicalOperator: 'AND' | 'OR' | null
  conditionType: 'question' | 'crop'
  conditionCrop: { cropId: string; name: string } | null
  conditionQuestion: { questionId: string; text: string } | null
  conditionValue: string | null
}
```

**Archivos a modificar:**

`backend/src/campaigns/campaigns.service.ts`
- Agregar función privada `mapStepToRender(step: CampaignStep)` que construya el objeto con `stepId`, `order`, `instrument`, y el nuevo `conditions: StepConditionRender[]`.
- Modificar `findOne()` para pasar cada paso por este mapper antes de retornar.
- Asegurar que `findOne()` carga `steps.conditions` junto con sus relaciones `conditionQuestion` y `conditionCrop` eager.
- Eliminar los campos `conditionQuestion` y `conditionValue` del nivel raíz del paso (eran el contrato legacy — ahora viven dentro del array `conditions`).

`backend/src/campaigns/dto/campaign-render.dto.ts` (crear — opcional, Swagger)
- Clases `StepConditionRenderDto` y `CampaignStepRenderDto` decoradas con `@ApiProperty`.

**Sin migraciones:** cambio de serialización solamente.

**Impacto lateral:** verificar que el frontend web no lea `step.conditionQuestion` o `step.conditionValue` del nivel raíz antes de deployar. Si los lee, actualizar esos accesos en `frontend/` como parte de esta fase.

#### 1b — Catálogo de cultivos en la respuesta de render

La respuesta de `GET /api/campaigns/:id/render` agrega un campo nuevo al nivel raíz:
```
availableCrops: Array<{ cropId: string; name: string }>
```

Este array contiene todos los cultivos registrados en `type_of_crops`. Es pequeño (4-6 elementos para el proyecto actual) y no cambia frecuentemente.

**Archivos a modificar:**

`backend/src/campaigns/campaigns.service.ts`
- Inyectar `TypeOfCropsRepository` (o el servicio equivalente) en `CampaignsService`.
- En `findOne()`, hacer una consulta `findAll()` a `type_of_crops` y agregar el resultado como `availableCrops` en la respuesta.

`backend/src/campaigns/campaigns.module.ts`
- Registrar `TypeOfCrop` en `imports: [TypeOrmModule.forFeature([..., TypeOfCrop])]` si no está ya.

---

### Fase 2 — Mobile: nueva tabla SQLite `session_crops`

**Objetivo:** persistir los cropIds extraídos de S2 asociados a una `campaignSessionId`.

**Decisión de diseño:** tabla separada `session_crops` (no columna JSON) para poder consultar por `cropId` directamente y seguir el patrón existente.

**Archivos a modificar:**

`mobile/src/storage/db/schema.ts`
- Agregar tabla `sessionCrops` con columnas:
  - `sessionId`: text, not null
  - `cropId`: text, not null
  - `cropName`: text, not null
  - Clave primaria compuesta `(sessionId, cropId)`

`mobile/src/storage/db/migrations/` (generado con `pnpm drizzle-kit generate`)
- Ejecutar `pnpm drizzle-kit generate` después de editar `schema.ts`.
- Reflejar la entrada `m0003` en `migrations/index.ts` con el SQL generado:
  `CREATE TABLE IF NOT EXISTS session_crops (session_id TEXT NOT NULL, crop_id TEXT NOT NULL, crop_name TEXT NOT NULL, PRIMARY KEY (session_id, crop_id))`

---

### Fase 3 — Mobile: módulo de persistencia `sessionCropsStorage`

**Objetivo:** encapsular el CRUD de `session_crops` siguiendo el patrón de `campaignCache.ts` e `instrumentCache.ts`.

**Archivos a crear:**

`mobile/src/storage/sessionCropsStorage.ts`
- Exportar objeto `sessionCropsStorage` con:
  - `save(sessionId, crops: CropSummary[]): Promise<void>` — upsert idempotente.
  - `get(sessionId): Promise<CropSummary[]>` — retorna crops de la sesión.
  - `remove(sessionId): Promise<void>` — limpia todos los crops de una sesión.

---

### Fase 4 — Mobile: actualizar tipos

**Objetivo:** reflejar el nuevo contrato del backend en los tipos locales.

**Archivos a modificar:**

`mobile/src/types/campaign.ts`
- Agregar interface `StepConditionRender`:
  ```
  conditionId: string
  order: number
  logicalOperator: 'AND' | 'OR' | null
  conditionType: 'question' | 'crop'
  conditionCrop: { cropId: string; name: string } | null
  conditionQuestion: { questionId: string; text: string } | null
  conditionValue: string | null
  ```
- Modificar `CampaignStepRender`: reemplazar `conditionQuestion` y `conditionValue` del nivel raíz por `conditions: StepConditionRender[]`.
- Modificar `CampaignRender` (o el tipo equivalente): agregar `availableCrops: Array<{ cropId: string; name: string }>`.

`mobile/src/api/campaigns.ts`
- Verificar y actualizar casts de tipo si los hay.

`mobile/src/storage/campaignCache.ts`
- Sin cambios de lógica (serializa JSON crudo). Verificar que no haya código que lea `step.conditionQuestion` o `step.conditionValue` directamente; si existe, actualizar para leer desde `step.conditions`.

---

### Fase 5 — Mobile: extracción local de cultivos desde SQLite (`extractCropsOffline`)

**Objetivo:** replicar localmente la lógica de `extractCrops` del backend, leyendo respuestas de S2 desde SQLite y usando el catálogo de cultivos cacheado para resolver `nombre → cropId`.

**Mecanismo:** las preguntas de cultivo en S2 tienen `systemField = 'crop.<nombre>'` y son de tipo `yes_no`. Si `booleanValue === true`, el agricultor trabaja ese cultivo. El catálogo `availableCrops` cacheado con la campaña resuelve el nombre al `cropId`.

**Archivos a crear:**

`mobile/src/lib/extractCropsOffline.ts`
- Exportar función `extractCropsOffline(s2SurveyId: string, campaignId: string): Promise<CropSummary[]>`.
- Pasos internos:
  1. Leer respuestas de S2 desde SQLite (tabla `responses`, filtrado por `surveyId`), cargando también el `systemField` de la pregunta asociada.
  2. Filtrar respuestas donde `question.systemField.startsWith('crop.')` y `booleanValue === true`.
  3. Extraer el nombre del cultivo: `systemField.split('.')[1]`.
  4. Obtener `availableCrops` desde `campaignCacheStorage.get(campaignId)`.
  5. Mapear cada nombre encontrado a su `{ cropId, name }` buscando en `availableCrops` por nombre.
  6. Retornar el array de `CropSummary[]` encontrados (ignorar nombres sin match en el catálogo).
- Si `campaignId` no está en caché o no hay respuestas, retornar `[]` sin lanzar error.

**Nota sobre el schema SQLite:** verificar que la tabla `responses` incluye `systemField` o que existe join con una tabla de preguntas que lo tenga. Si la respuesta no almacena `systemField` localmente, habría que leerlo desde el instrumento cacheado en `instrumentCache` usando el `questionId` de cada respuesta. Confirmar esto al implementar.

---

### Fase 6 — Mobile: persistir cropIds en ambos paths (online y offline)

**Objetivo:** garantizar que `sessionCropsStorage` se puebla tanto si S2 se hace online como offline.

**Archivos a modificar:**

`mobile/app/campaign/[id]/session/[sessionId]/orchestrator.tsx`
- **Path online (S2 completado con red):** capturar el retorno de `await extractCrops(s2SurveyId)` y llamar `sessionCropsStorage.save(resolvedSessionId, result.crops)`.
- **Path offline (S2 completado sin red):** después de `store.completeS2Injection()`, llamar `await extractCropsOffline(s2SurveyId, id)` y guardar el resultado con `sessionCropsStorage.save(resolvedSessionId, crops)`.

`mobile/src/sync/SyncQueueService.ts`
- En `maybeExtractFarmerAndCrops()`: capturar el retorno de `await extractCrops(realSurveyId)` y llamar `sessionCropsStorage.save(entry.campaignSessionId, result.crops)`.
- Guardar solo si `entry.campaignSessionId` no es null.
- Este path cubre el caso de S2 hecho offline que luego sincroniza: sobreescribe (upsert) lo que `extractCropsOffline` haya guardado con los datos definitivos del backend.

---

### Fase 7 — Mobile: evaluación offline de condiciones de cultivo

**Objetivo:** implementar la lógica de evaluación y usarla en `getNextStepOffline`.

**Archivos a crear:**

`mobile/src/lib/stepPassesConditionsOffline.ts`
- Exportar función pura `stepPassesConditionsOffline(step: CampaignStepRender, cropIds: string[]): boolean`.
- Lógica:
  - Si `step.conditions` está vacío o undefined → `true`.
  - Iterar condiciones ordenadas por `condition.order`.
  - `conditionType === 'crop'`: evaluar si `condition.conditionCrop?.cropId` está en `cropIds`.
  - `conditionType === 'question'`: retornar `true` (política conservadora offline).
  - Combinar con `logicalOperator`: primer resultado es el acumulador; `'OR'` → OR, `'AND'` o `null` → AND.
- Función pura (sin I/O): testeable unitariamente.

**Archivos a modificar:**

`mobile/src/lib/getNextStepOffline.ts`
- Cargar `cropIds` internamente al inicio de la función con `sessionCropsStorage.get(sessionId)` (mantiene el contrato externo sin cambios para los callers).
- En el `.find()` de pasos, agregar: `&& stepPassesConditionsOffline(step, cropIds)`.

---

### Fase 8 — Mobile: tests

**Archivos a crear:**

`mobile/src/__tests__/stepPassesConditionsOffline.test.ts`
- Casos:
  - Paso sin condiciones → `true`
  - Condición `crop` que coincide → `true`
  - Condición `crop` que no coincide → `false`
  - Condición `question` → siempre `true` offline
  - Múltiples condiciones con AND
  - Múltiples condiciones con OR
  - `conditionCrop: null` en condición de tipo `crop` → `false`

`mobile/src/__tests__/extractCropsOffline.test.ts`
- Casos:
  - Respuestas de S2 con `systemField = 'crop.café'` y `booleanValue = true` → retorna crop con cropId correcto
  - Respuesta `booleanValue = false` → no incluida
  - Nombre de cultivo sin match en `availableCrops` → ignorado (no lanza error)
  - Sin respuestas en SQLite → retorna `[]`
  - Sin campaña en caché → retorna `[]`

**Archivos a modificar:**

`mobile/src/__tests__/SyncQueueService.test.ts`
- Agregar caso: cuando `maybeExtractFarmerAndCrops` procesa un S2, verifica que `sessionCropsStorage.save` se llama con los crops retornados por `extractCrops`.

---

## Orden de implementación

| Orden | Fase | Dependencias |
|---|---|---|
| 1 | Fase 1 (backend — render + availableCrops) | — |
| 2 | Fase 2 (schema SQLite) | — |
| 3 | Fase 3 (sessionCropsStorage) | Fase 2 |
| 4 | Fase 4 (tipos) | Fase 1 |
| 5 | Fase 5 (extractCropsOffline) | Fases 3, 4 |
| 6 | Fase 6 (persistir cropIds — online y offline) | Fases 3, 5 |
| 7 | Fase 7 (evaluación offline) | Fases 3, 4 |
| 8 | Fase 8 (tests) | Fases 5, 7 |

Las fases 1 y 2 son independientes y pueden ejecutarse en paralelo.

---

## Resumen de archivos involucrados

| Repositorio | Archivo | Acción |
|---|---|---|
| `backend/` | `src/campaigns/campaigns.service.ts` | Modificar — mapper de condiciones + incluir `availableCrops` |
| `backend/` | `src/campaigns/campaigns.module.ts` | Modificar — registrar `TypeOfCrop` si falta |
| `backend/` | `src/campaigns/dto/campaign-render.dto.ts` | Crear (opcional, Swagger) |
| `mobile/` | `src/storage/db/schema.ts` | Modificar — agregar tabla `sessionCrops` |
| `mobile/` | `src/storage/db/migrations/index.ts` | Modificar — agregar entrada `m0003` |
| `mobile/` | `src/storage/sessionCropsStorage.ts` | Crear — módulo CRUD de crops por sesión |
| `mobile/` | `src/types/campaign.ts` | Modificar — `StepConditionRender`, actualizar `CampaignStepRender` y `CampaignRender` |
| `mobile/` | `src/api/campaigns.ts` | Verificar/actualizar casts de tipo |
| `mobile/` | `src/lib/extractCropsOffline.ts` | Crear — extracción local de cultivos desde SQLite |
| `mobile/` | `src/lib/stepPassesConditionsOffline.ts` | Crear — función pura de evaluación de condiciones |
| `mobile/` | `src/lib/getNextStepOffline.ts` | Modificar — usar `stepPassesConditionsOffline` |
| `mobile/` | `src/sync/SyncQueueService.ts` | Modificar — persistir resultado de `extractCrops` |
| `mobile/` | `app/campaign/[id]/session/[sessionId]/orchestrator.tsx` | Modificar — persistir crops en path online y offline de S2 |
| `mobile/` | `src/__tests__/stepPassesConditionsOffline.test.ts` | Crear — tests unitarios |
| `mobile/` | `src/__tests__/extractCropsOffline.test.ts` | Crear — tests unitarios |
| `mobile/` | `src/__tests__/SyncQueueService.test.ts` | Modificar — cubrir guardado de crops |
