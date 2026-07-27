# Backlog

Hallazgos y deuda técnica pendientes, fuera del scope de un spec activo.
No se actúa sobre estos ítems sin aprobación explícita del usuario.

## Estado de los ítems

| Ítem | Spec redactado | Estado |
|---|---|---|
| Vulnerabilidades Dependabot | — | Sin spec; pendiente de priorización |
| Instrumentos condicionados por cultivo offline (Bug A) | `spec/49_correccion_identidad_offline_agricultor_cultivos.md` | `[NOT STARTED]` — spec + pruebas listos, pendiente de aprobación |
| Duplicados offline / `farmerId` inconsistente (Bug B) | `spec/49_…` (mismo spec) | `[NOT STARTED]` |
| `farmerCache` obsoleta → FK violation (Bug C) | `spec/49_…` (mismo spec) | `[NOT STARTED]` |
| Textos cortados / escalado de fuente | `mobile/specs/spec24.md` | `[NOT STARTED]` — spec + pruebas listos, pendiente de aprobación |

## Vulnerabilidades Dependabot (revisadas 2026-07-24)

Origen: `gh api repos/sosagro-mirp/sos-agro-mobile/dependabot/alerts`. Las 6
alertas activas son **todas transitivas** vía el toolchain de desarrollo
(`eslint-config-expo`, `expo`, `jest-expo`) — ninguna llega a través de una
dependencia directa del código de la app. Ningún fix inmediato disponible sin
tocar `overrides` en `package.json` (riesgo de romper resolución de otras
transitivas) o esperar upgrade de esos paquetes raíz.

| # | Paquete | Severidad | Resumen | Vía (paquete raíz) | Fix disponible |
|---|---------|-----------|---------|---------------------|-----------------|
| 6 | `brace-expansion` | 🔴 Alta | DoS por expansión exponencial de grupos `{}` no expansivos consecutivos (CVE-2026-13149) | `eslint` → `minimatch@3.1.5` → `eslint-config-expo` (devDependency) | `>=1.1.16` / `>=2.1.2` / `>=5.0.7` según rango |
| 4 | `undici` | 🔴 Alta | DoS en cliente WebSocket: bypass de límite de fragmentos, agotamiento de memoria (CVE-2026-12151) | `@expo/cli` → `expo` (dependency) | `>=6.27.0` / `>=7.28.0` / `>=8.5.0` |
| 5 | `undici` | 🟡 Media | Inyección de headers HTTP vía percent-decoding de `Set-Cookie` (CVE-2026-9679) | `@expo/cli` → `expo` (dependency) | mismo rango que arriba |
| 1 | `js-yaml` | 🟡 Media | DoS cuadrático en manejo de merge keys (`<<`) con alias repetidos (CVE-2026-53550) | `@istanbuljs/load-nyc-config` → `babel-plugin-istanbul` → `jest` → `jest-expo` (devDependency) | `>=3.15.0` / `>=4.2.0` |
| 3 | `undici` | 🟢 Baja | Downgrade de atributo `SameSite` en `Set-Cookie` por matching de substring permisivo (CVE-2026-11525) | `@expo/cli` → `expo` (dependency) | mismo rango que arriba |
| 2 | `undici` | 🟢 Baja | Envenenamiento de cola de respuestas HTTP vía reuso de socket keep-alive (CVE-2026-6733) | `@expo/cli` → `expo` (dependency) | mismo rango que arriba |

**Evaluación de riesgo real:** las 4 alertas de `undici` y `brace-expansion`
requieren un servidor HTTP/WebSocket malicioso o alias YAML manipulados —
superficie de ataque baja para esta app (cliente móvil, no expone estos
paquetes como servidor). Igual deben resolverse en algún punto por higiene de
supply chain, pero no son urgentes para el piloto en curso.

**Próximos pasos sugeridos (sin ejecutar sin aprobación):**
- Revisar si `expo@54.0.35` tiene una versión parche disponible que ya
  actualice su `undici` interno antes de considerar un `pnpm.overrides`.
  `pnpm why undici` confirma que viene de `@expo/cli` → `expo`, no de una
  dependencia directa del proyecto.
- Igual para `eslint-config-expo` (trae `eslint@9.39.5` → `minimatch@3.1.5` →
  `brace-expansion@1.1.15`) y `jest-expo` (trae `jest@29.7.0` →
  `babel-plugin-istanbul` → `js-yaml@3.14.2`).
- Si no hay upgrade disponible en el corto plazo, evaluar `pnpm.overrides` en
  `package.json` apuntando a las versiones parcheadas, verificando que no
  rompa `pnpm test` / `pnpm typecheck` / build de Expo.

## Bug: instrumentos condicionados por cultivo no aparecen offline (encontrado en piloto APK, `docs/testing/17-test-piloto-multidispositivo.md`)

**Reportado por el usuario:** 2026-07-27. Detectado durante pruebas manuales
del piloto multidispositivo sobre APK real — los instrumentos con condiciones
de tipo `crop` (ej. instrumento específico de café/cacao/cannabis/cáñamo)
**no se ofrecen cuando el dispositivo está offline**, aunque el agricultor
haya respondido afirmativamente las preguntas de cultivo en S2
(`instrumento-s1b-identificacion-de-la-unidad-productiva`).

**Causa raíz (diagnóstico confirmado por lectura de código, no reproducido en
dispositivo):** `mobile/src/lib/extractCropsOffline.ts:45-57` reimplementa
`SurveysService.extractCrops()` del backend
(`backend/src/surveys/surveys.service.ts:509-548`) pero **omite** el mapeo
`CROP_FIELD_MAP` que traduce la clave ASCII del `systemField` (`crop.cafe`,
`crop.canamo`, …) al nombre real del catálogo `TypeOfCrop` (`'Café'`,
`'Cáñamo'`, con tilde y mayúscula inicial). Sin ese mapeo, la comparación de
strings (`'cafe' === 'Café'`) nunca coincide, `extractCropsOffline` siempre
devuelve `[]`, `sessionCropsStorage` queda vacío para la sesión, y
`stepPassesConditionsOffline.ts:37-39` evalúa toda condición `crop` como
`false` → el instrumento condicionado se filtra en
`getNextStepOffline.ts:45-50` y nunca se muestra.

Online no falla porque el matching de nombre lo hace el backend, que sí tiene
el `CROP_FIELD_MAP` completo.

**Por qué no lo detectaron los tests existentes:**
`mobile/src/__tests__/extractCropsOffline.test.ts:114-131` usa fixtures no
representativos (`systemField: 'crop.café'` con tilde, `availableCrops: [{
name: 'café' }]` en minúscula) que ocultan el desajuste real de
mayúscula/tilde entre el `systemField` de producción (ASCII) y el nombre del
catálogo (`types-of-crops.seed.ts:4-9`).

**Archivos a tocar en el fix (referencia, sin modificar todavía):**
- `mobile/src/lib/extractCropsOffline.ts:45-57` — aplicar el mismo
  `CROP_FIELD_MAP` que `backend/src/surveys/surveys.service.ts:517-521`
  antes de comparar contra `campaign.availableCrops`. Evaluar extraer el mapa
  a un lugar compartido para que no vuelva a divergir entre backend y móvil.
- `mobile/src/__tests__/extractCropsOffline.test.ts` — corregir fixtures para
  reflejar los valores reales de producción (`systemField: 'crop.cafe'` /
  `availableCrops: [{ name: 'Café' }]`).

**Estado:** ⬜ Pendiente de aprobación para implementar. No corregido en esta
sesión por instrucción explícita del usuario (solo diagnóstico + registro).

## Bug: detección de duplicados offline no dispara aviso al re-encuestar al mismo agricultor (encontrado en piloto APK, `docs/testing/17-test-piloto-multidispositivo.md`, TC-04)

**Reportado por el usuario:** 2026-07-27. Detectado durante pruebas del
piloto multidispositivo — si un agricultor identificado **con conexión** es
vuelto a encuestar **offline** en el mismo dispositivo, no se muestra el
`DuplicateAlertModal` aunque ya exista una encuesta previa para él. El
usuario aclara que la detección solo necesita funcionar **a nivel de
dispositivo** (contra SQLite local), no contra el backend/otros dispositivos.

**Causa raíz (diagnóstico confirmado por lectura de código, no reproducido en
dispositivo):** no es un problema de la lógica de comparación ni de su
invocación — ambas funcionan correctamente offline. `checkDuplicateLocal()`
(`mobile/src/storage/duplicateDetection.ts:12-45`) compara 100% local contra
`surveys` + `responses` por `farmerId + instrumentId`, y se invoca bien desde
el flujo offline en `orchestrator.tsx:150-184`.

El problema es un `farmerId` inconsistente entre dos identificaciones del
mismo agricultor:
1. Cuando la identificación S1 ocurre **online**,
   `orchestrator.tsx:238-243` obtiene el `farmerId` real del backend vía
   `extractFarmer()` pero **nunca lo persiste** en `farmerCacheStorage` (la
   tabla local que mapea `documentId → farmerId`). La encuesta sí queda en
   `surveys` con ese `farmerId` real.
2. Si luego, **offline**, se vuelve a encuestar al mismo agricultor,
   `farmerCacheStorage` no lo tiene cacheado →
   `extractFarmerLocally()` (`mobile/src/lib/extractFarmerLocally.ts:89-104`)
   genera un `farmerId` **local nuevo y provisional** para la misma persona.
3. `checkDuplicateLocal()` compara contra ese `farmerId` nuevo, que no
   coincide con el de la primera encuesta → `hasDuplicate: false` → no se
   muestra el aviso.

El cacheo sí existe en la rama offline de `orchestrator.tsx` (línea 249) y en
`SyncQueueService.maybeExtractFarmerAndCrops` (líneas 316-321 de
`mobile/src/sync/SyncQueueService.ts`), pero ese último llega demasiado tarde
si el segundo intento offline ocurre antes de que corra la sincronización en
segundo plano.

**Archivos a tocar en el fix (referencia, sin modificar todavía):**
- `mobile/app/campaign/[id]/session/[sessionId]/orchestrator.tsx:238-243` —
  agregar `farmerCacheStorage.upsert({ farmerId: farmer.farmerId,
  documentId: farmer.documentId, name: farmer.name, ... })` análogo al que ya
  existe en la rama offline (línea 249), para que el mapeo
  `documentId → farmerId` quede disponible localmente apenas se identifica a
  alguien, sin importar si la identificación ocurrió online u offline.

No hace falta tocar `duplicateDetection.ts`, los call-sites de
`checkDuplicate`, ni `DuplicateAlertModal.tsx` — todos correctos.

**Estado:** ⬜ Pendiente de aprobación para implementar. No corregido en esta
sesión por instrucción explícita del usuario (solo diagnóstico + registro).

## Bug: `farmerCacheStorage` local no se invalida al borrar un agricultor en backend → `POST /api/campaign-sessions` falla con FK violation (Sentry NODE-NESTJS-3, producción)

**Reportado por el usuario:** 2026-07-27. Detectado vía Sentry durante el
piloto multidispositivo (`docs/testing/17-test-piloto-multidispositivo.md`).
Confirmado por el usuario: en una ronda de pruebas anterior se creó/buscó un
agricultor de prueba en un dispositivo y luego se **borró vía API** como
parte de la limpieza de datos de esa ronda (protocolo de
`docs/testing/test-NNN`). El dispositivo siguió usándose en una ronda
posterior y reenvió el `farmerId` ya inexistente.

**Síntoma en producción:** `QueryFailedError: insert or update on table
"campaign_sessions" violates foreign key constraint
"FK_cf3caca4335425e4966807bf4fb"` en `POST /api/campaign-sessions` (backend,
`src/campaign-sessions/campaign-sessions.service.ts:73`). Confirmado por
consulta directa a Neon (prod, solo lectura):
```
FK_cf3caca4335425e4966807bf4fb: campaign_sessions.farmer_id
  → REFERENCES farmers(id) ON DELETE RESTRICT
```
6 ocurrencias en ~20s, sesión de un dispositivo Android real (APK, no Expo
Go) del piloto. `Farmer` no tiene `DeleteDateColumn` (sin soft-delete), así
que un `farmer_id` borrado no deja rastro y el `@IsUUID()` del DTO no lo
detecta (formato válido, solo no existe la fila).

**Causa raíz:** `mobile/src/storage/farmerCache.ts` (`farmerCacheStorage`) es
una caché local persistente en SQLite que **nunca se invalida** cuando un
agricultor se borra en el backend. Dos caminos reenvían un `farmerId`
cacheado sin verificar que siga existiendo:
1. `PreSurveyForm.tsx:46` — la búsqueda offline consulta
   `farmerCacheStorage.search()` y puede ofrecer un agricultor ya borrado en
   el backend; si se selecciona, `startSessionOnline`
   (`mobile/app/campaign/[id]/pre-survey.tsx:66-71`) lo envía directo en
   `POST /api/campaign-sessions`.
2. `SyncQueueService.resolveLocalSessions`
   (`mobile/src/sync/SyncQueueService.ts:137-152`) reenvía
   `session.farmerId` (cacheado al crear la sesión offline) al reconectar,
   sin revalidar que el agricultor siga existiendo — solo filtra IDs locales
   provisionales (`isLocalId`), no IDs reales que hayan sido borrados desde
   entonces.

**Backend — falta de manejo defensivo (secundario, no es la causa raíz):**
`CampaignSessionsService.create()` (`backend/src/campaign-sessions/campaign-sessions.service.ts:62-89`)
no valida que `farmerId`/`userId` existan antes del `save()` (a diferencia de
`campaignId`, que sí se valida con `NotFoundException` en la línea 66) — deja
que la FK de Postgres sea la única defensa, lo que produce un 500 sin
manejar en vez de un 404/400 claro para el cliente.

**Archivos a tocar en el fix (referencia, sin modificar todavía):**
- `mobile/src/storage/farmerCache.ts` — evaluar invalidación/TTL de entradas
  cacheadas, o revalidar contra el backend antes de reutilizar un `farmerId`
  cacheado cuando hay conexión.
- `mobile/app/campaign/[id]/pre-survey.tsx` y
  `mobile/src/sync/SyncQueueService.ts:137-152` — considerar manejar el error
  4xx/404 que debería devolver el backend (ver punto siguiente) reintentando
  como "agricultor nuevo" en vez de fallar silenciosamente/quedar en cola.
- `backend/src/campaign-sessions/campaign-sessions.service.ts:62-89` —
  validar `farmerId`/`userId` explícitamente (igual que `campaignId`) y
  lanzar `NotFoundException` en vez de dejar que la FK de Postgres produzca
  un 500 no controlado.

**Estado:** ⬜ Pendiente de aprobación para implementar. No corregido en esta
sesión por instrucción explícita del usuario (solo diagnóstico + registro).
Issue de Sentry sin resolver: `NODE-NESTJS-3`.

## Bug visual: textos cortados en la UI ("En línea" / "Sin conexión" / "Actualizar") en pantallas angostas o con fuente del sistema aumentada

**Reportado por el usuario:** 2026-07-27. Probando la APK en un Samsung
Galaxy S25, los textos "En línea"/"Sin conexión" (píldora de estado en el
header de tabs) y "Actualizar" (botón del header de Campañas) se ven
cortados.

**Causa raíz (diagnóstico por lectura de código, pendiente de confirmar el
% de escala de fuente/resolución exacto del dispositivo):** ningún texto ni
contenedor del proyecto tiene protección de overflow — no se usa
`flexShrink`, `flexWrap`, `numberOfLines` ni `adjustsFontSizeToFit` en estos
puntos, y tampoco hay un límite global de escalado de fuente
(`allowFontScaling`/`maxFontSizeMultiplier`); confirmado que ninguna de esas
props se usa en todo `src/`/`app/`. Es una falta de manejo de overflow de
texto consistente en toda la app, no un bug puntual — se manifiesta primero
en los elementos más ajustados de espacio:

- **"En línea" / "Sin conexión"** — `app/(tabs)/_layout.tsx:44`, dentro de
  `statusPill` (líneas 42-45, `paddingHorizontal: 10`, `paddingVertical: 5`,
  `fontSize: 12`). Vive en la fila `headerRight` junto al nombre de usuario y
  el botón "Salir", con `justifyContent: space-between` y sin `flexShrink` en
  ningún hijo (default de RN/Yoga: los hijos no se encogen). Si el ancho
  total de la fila excede el disponible (pantalla angosta o fuente del
  sistema aumentada — común en el ajuste "Tamaño de fuente" de One UI en
  Samsung), el extremo derecho queda parcial o totalmente fuera de pantalla.
- **"Actualizar"** — `app/(tabs)/campaign/index.tsx:64`, mismo patrón: fila
  `header` (líneas 207-216) con `justifyContent: space-between` entre el
  título "Campañas" y el botón, sin protección de encogimiento.

**Archivos a tocar en el fix (referencia, sin modificar todavía):**
- `app/(tabs)/_layout.tsx` — agregar `flexShrink`/`numberOfLines={1}` a
  `statusText`/`userName`, o permitir que `headerRight` haga wrap.
- `app/(tabs)/campaign/index.tsx` — mismo tratamiento en `header`/`refreshBtn`.
- Evaluar una solución global: capar `maxFontSizeMultiplier` en los `Text` de
  componentes de layout ajustado (headers, píldoras, botones cortos), o un
  wrapper de `Text` del proyecto con un default sensato, en vez de parchear
  caso por caso.

**Estado:** ⬜ Pendiente de aprobación para implementar. No corregido en esta
sesión por instrucción explícita del usuario (solo diagnóstico + registro).
Diagnóstico basado en lectura de código; falta confirmar en el dispositivo
el % exacto de escala de fuente/resolución que lo reproduce.
