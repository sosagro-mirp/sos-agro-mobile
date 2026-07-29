# Backlog

Hallazgos y deuda técnica pendientes, fuera del scope de un spec activo.
No se actúa sobre estos ítems sin aprobación explícita del usuario.

## Estado de los ítems

| Ítem | Spec redactado | Estado |
|---|---|---|
| Vulnerabilidades Dependabot | — | Sin spec; pendiente de priorización |
| Instrumentos condicionados por cultivo offline (Bug A) | `spec/49_correccion_identidad_offline_agricultor_cultivos.md` | `[DONE]` |
| Duplicados offline / `farmerId` inconsistente (Bug B) | `spec/49_…` (mismo spec) | `[DONE]` |
| `farmerCache` obsoleta → FK violation (Bug C) | `spec/49_…` (mismo spec) | `[DONE]` |
| Textos cortados / escalado de fuente | `mobile/specs/spec24.md` | `[DONE]` |
| `DELETE /api/farmers/:id` → 500 por FK de `campaign_sessions` (nuevo) | — | Sin spec; hallazgo de la ronda manual del spec 49 |
| Sync no se dispara solo al reconectar en Expo Go (nuevo) | — | Sin spec; hallazgo de la ronda manual del spec 49, sin confirmar en APK real |
| Caché de identidad provisional no se limpia tras sincronizar (Bug B residual) | `spec/51_limpieza_identidad_provisional_post_sync.md` | `[TESTING]` — `@reviewer` APROBADO, falta ronda manual |
| Sesión sin agricultor tras reintento por 404 (documentación) | `spec/51_…` (Fase 3, `docs/data-notes.md` en backend) | `[TESTING]` — documentación aplicada, `@reviewer` APROBADO |
| `isProvisional` sigue mintiendo en el ciclo offline puro (nuevo) | — | Sin spec; hallazgo de `@reviewer` sobre la rama del spec 51, preexistente |

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

**Estado:** ✅ Corregido — spec `spec/49_correccion_identidad_offline_agricultor_cultivos.md` marcado `[DONE]`.

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

**Estado:** ✅ Corregido — spec `spec/49_correccion_identidad_offline_agricultor_cultivos.md` marcado `[DONE]`.

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

**Estado:** ✅ Corregido — spec `spec/49_correccion_identidad_offline_agricultor_cultivos.md` marcado `[DONE]`.
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

**Estado:** ✅ Corregido — spec `mobile/specs/spec24.md` marcado `[DONE]`.
Diagnóstico basado en lectura de código; falta confirmar en el dispositivo
el % exacto de escala de fuente/resolución que lo reproduce.

## Bug: `DELETE /api/farmers/:id` devuelve 500 en vez de un error manejado cuando el agricultor tiene una `campaign_sessions` asociada (encontrado en ronda manual de `docs/testing/21-test-spec49.md`, TC-049-08 y TC-049-10)

**Detectado:** 2026-07-28, preparando datos de prueba para la ronda manual del
spec 49 (backend local). Al intentar borrar un agricultor de prueba que había
sido **seleccionado** desde la búsqueda de pre-encuesta (y esa sesión luego
cancelada sin completar ninguna encuesta), `DELETE /api/farmers/:id` respondió
`500 Internal Server Error` en vez de completar el borrado.

**Causa raíz:** seleccionar un agricultor en la pre-encuesta online crea de
inmediato una fila real en `campaign_sessions` (`startSessionOnline` →
`createCampaignSession`), incluso si el encuestador nunca llega a completar ni
una sola pregunta y simplemente sale de la pantalla. Esa fila queda
referenciando al agricultor vía `campaign_sessions.farmer_id → farmers(id) ON
DELETE RESTRICT`. No existe ningún endpoint para eliminar una
`campaign_sessions` individual (`campaign-sessions.controller.ts` solo expone
`POST`, `GET /:id`, `GET /:id/next-step`, `GET last-farmer` — sin `DELETE`),
así que no hay forma de resolver la restricción vía API. En la ronda de
pruebas hubo que borrar la fila directamente en la base de datos (con
aprobación explícita del usuario) para poder continuar.

**Impacto:** cualquier agricultor que haya sido "tocado" alguna vez desde el
flujo de pre-encuesta —aunque la sesión resultante nunca se haya completado ni
sincronizado ninguna encuesta— queda imposible de borrar vía API. Es un nivel
de causa raíz por encima del bug de `farmerCache` obsoleta que motivó el spec
49: ese spec corrige los síntomas (caché del cliente + 404 al *crear* una
sesión), pero no toca este endpoint de borrado, que sigue devolviendo un 500
sin manejar ante la misma FK.

**Archivos a tocar en el fix (referencia, sin modificar todavía):**
- `backend/src/farmers/farmers.service.ts` (método `remove()`) — capturar la
  violación de FK y devolver un error claro (`ConflictException` o similar) en
  vez de dejar que se propague como 500; o evaluar cascada/soft-delete de
  `campaign_sessions` sin datos asociados.
- Evaluar si conviene un endpoint `DELETE /api/campaign-sessions/:id` acotado
  a sesiones sin `surveys` asociadas, para limpieza de datos de prueba sin
  necesidad de acceso directo a la base.

**Estado:** ⬜ Pendiente de aprobación para implementar. No corregido en esta
sesión (fuera del scope del spec 49, solo diagnóstico + registro).

## Hallazgo: sincronización no se dispara automáticamente al reconectar en Expo Go (encontrado en ronda manual de `docs/testing/21-test-spec49.md`, TC-049-10)

**Detectado:** 2026-07-28, ejecutando TC-049-10 (resolución de sesión offline
pendiente al reconectar) sobre **Expo Go**, no APK real. Tras desactivar el
modo avión, la cola de sincronización no se vació sola — solo se resolvió al
tocar el botón manual "Sincronizar ahora" en la pestaña Sincronización
(`app/(tabs)/sync/index.tsx` → `NetworkMonitor.checkAndSync()`).

**Diagnóstico parcial:** el fix de `SyncQueueService.resolveLocalSessions`
bajo prueba en ese caso **sí funcionó correctamente** una vez invocado
manualmente — el problema está un nivel más arriba, en que
`NetworkMonitor.handleStateChange` (`mobile/src/sync/NetworkMonitor.ts:21-35`)
no disparó `processAll()` automáticamente al detectar la transición
offline→online. No se investigó más a fondo si es una particularidad de Expo
Go (posible retraso o comportamiento distinto de `NetInfo` fuera de un build
nativo) o un bug real en la lógica de `previouslyReachable`.

**Antes de tratarlo como bug confirmado:** repetir el mismo escenario con APK
real (perfil `preview`/`development`) — el requisito de dispositivo original
del spec 49 asumía APK real precisamente por este tipo de diferencia de
comportamiento entre Expo Go y un build nativo.

**Estado:** ⬜ Sin diagnóstico de causa raíz confirmado. No corregido en esta
sesión (fuera del scope del spec 49, solo observación + registro).

## Hallazgo: `isProvisional` sigue mintiendo en el ciclo offline puro (encontrado por `@reviewer` en la rama del spec 51)

**Detectado por `@reviewer`:** 2026-07-29, auditoría de
`docs/reports/auditorias/15-auditoria-mobile-spec51.md`, sobre la rama
`bug/spec51-limpieza-identidad-provisional`. **No es una regresión de ese
spec** — es un comportamiento preexistente que el spec 51 no se propuso
corregir (su hallazgo B ataca la lectura ambigua entre dos filas, no este
caso).

**Escenario:** con **solo una entrada provisional** en `farmerCache` para un
`documentId` (agricultor identificado offline, todavía sin sincronizar),
`extractFarmerLocally` devuelve `isProvisional: false` con un `farmerId`
local — el flag miente porque la función confía en que "estar en caché"
implica identidad real, sin distinguir si esa entrada es provisional.

**Consecuencia observada:** el store deja `localFarmerId` en `null` (porque el
código que lo setea depende de que `isProvisional` sea `true`), y por eso la
guarda de `SyncQueueService.ts:341` (`if (storeState.localFarmerId ===
localFarmerId)`) no dispara — el `resolveFarmer()` en memoria de la sesión
activa no ocurre al sincronizar. Los datos en SQLite (`surveys.farmerId`, la
entrada de `farmerCache`) sí se remapean correctamente vía la Fase 1 del spec
51; el impacto se limita al estado en memoria de la sesión en curso si sigue
abierta en el momento exacto del sync.

**Estado:** ⬜ Sin spec. Pendiente de priorización — no corregido, solo
diagnóstico + registro.

## Hallazgo: caché de identidad provisional no se limpia tras sincronizar → riesgo residual del Bug B en el ciclo offline → sync → offline

**Detectado por `@reviewer`:** 2026-07-27, auditoría de
`docs/reports/auditorias/13-auditoria-mobile-spec49-spec24.md`, hallazgo 🟠-1,
sobre la rama del spec 49 (`bug/spec49-identidad-offline`).

Cuando una identificación S1 ocurre **offline**, `extractFarmerLocally()`
genera un `farmerId` local provisional y lo cachea con `isProvisional: true`.
Al reconectar, `SyncQueueService` (`src/sync/SyncQueueService.ts:325-349`,
`maybeExtractFarmerAndCrops` o equivalente) resuelve la identidad real contra
el backend, pero **no borra la entrada provisional** de `farmerCacheStorage`
— queda una entrada vieja (provisional) y una nueva (real) compartiendo el
mismo `documentId`. `farmerCacheStorage.getByDocumentId()`
(`src/storage/farmerCache.ts:90-97`) no tiene `ORDER BY`, así que no hay
garantía de cuál de las dos devuelve.

**Impacto:** si tras esa sincronización el dispositivo vuelve a quedar
offline y se re-encuesta al mismo agricultor, `extractFarmerLocally` podría
resolver la entrada **provisional** vieja (marcada `isProvisional: false`
igual, porque `getByDocumentId` no distingue) en vez de la real — reintroduce
el síntoma del Bug B (criterios 7 y 8 del spec 49) específicamente en el ciclo
**offline → sync → offline**, que la ronda manual de
`docs/testing/21-test-spec49.md` no cubrió (TC-049-05/06 solo prueba
online → offline).

**Archivos a tocar en el fix (referencia, sin modificar todavía):**
- `src/sync/SyncQueueService.ts` — al resolver la identidad real tras
  sincronizar, borrar o sobrescribir explícitamente la entrada provisional
  (`farmerCacheStorage.remove(provisionalId)` antes de cachear la real, o
  reutilizar la misma fila vía upsert por `documentId` en vez de por
  `farmerId`).
- `src/storage/farmerCache.ts` — evaluar agregar `ORDER BY cachedAt DESC` (o
  similar) a `getByDocumentId()` como defensa adicional, aunque no resuelve la
  causa raíz (dos filas para la misma persona no debería ser un estado
  válido).

**Estado:** ⬜ Pendiente de aprobación para implementar. No corregido en esta
sesión (fuera del scope de la rama del spec 49, solo diagnóstico + registro).

## Hallazgo: sesión sin agricultor tras el reintento por 404 deja respuestas huérfanas de identidad

**Detectado por `@reviewer`:** 2026-07-27, mismo informe, hallazgo 🟠-3.

Cuando `SyncQueueService.resolveLocalSessions` reintenta la creación de una
sesión sin `farmerId` tras un 404 (fix del Bug C, spec 49), la sesión se crea
correctamente en el backend, pero queda **sin agricultor asociado y sin un
S1 nuevo del que extraerlo** — las respuestas de esa sesión llegan al backend
"huérfanas" de identidad. Es el comportamiento esperado dado el diseño actual
(no hay otra opción sin bloquear al encuestador), pero no está documentado
como tal en ningún lado visible para quien analice los datos después.

**Acción sugerida:** documentar este comportamiento (en el spec 49 o en la
documentación de datos del backend) para que no se interprete como un bug de
integridad de datos al encontrarlo en producción.

**Estado:** ⬜ Sin acción pendiente de implementación — es una observación de
documentación, no un bug de comportamiento. Registrado para no perder el
contexto.
