# Pendientes de build EAS

> Registro de cambios de código ya committeados que **todavía no se han verificado en un build EAS
> real** (no basta con Expo Go: `expo-updates` no está instalado — ver
> `spec/backlog.md` → "El build instalado en las tablets tiene EAS Update desactivado en
> runtime" —, así que la única forma de llevar código nuevo, incluso puramente JS, a un APK ya
> instalado es generar un build nuevo). El plan Free de EAS tiene cupo limitado
> (`https://expo.dev/accounts/{{cuenta}}/settings/billing`), así que no se genera un build por cada
> commit: se acumulan aquí hasta que valga la pena gastar uno.

**Última consulta de cuota:** 2026-08-29 — plan Free, 15 Android + 15 iOS por mes (cupos
independientes, no intercambiables), 8/15 Android usados este ciclo.

## Convención de esta lista

Cada fila es un cambio pendiente de verificar en dispositivo real. Se elimina de aquí (no se
archiva) en cuanto un build lo cubre y la ronda manual correspondiente lo confirma en
`docs/testing/`.

| # | Cambio | Commit | Spec / caso que lo verifica | Requiere build nativo (no solo JS) |
|---|--------|--------|------------------------------|--------------------------------------|
| 1 | `app/dev/logs.tsx`: lista de logs agrupada por fecha vía `logger.getLogs()`, en vez de una fila por segmento | `b46b653` | Spec 76 — repetir `TC-076-08` | No (JS puro, pero sin OTA igual exige build) |
| 2 | `src/lib/logger.ts`: `logger.clearAll()` borra archivos y estado en memoria de forma atómica — "Limpiar logs" ya no resucitaba el segmento del día | `321e597` | Spec 76 — repetir `TC-076-08` (botón "Limpiar logs") | No (JS puro, pero sin OTA igual exige build) |
| 3 | Resiliencia de red en pre-encuesta y extract-farmer: fallback a caché en `PreSurveyForm`, `withNetworkRetry` en `extractFarmer`/`extractCrops`, desatasco de la cola `in_flight` desde `processSurveyNow()`, `reachability` de 3 estados (`online`/`offline`/`server_unreachable`) vía `GET /api/health` | `2dd19c3` | Spec 81 — `docs/testing/test-081-resiliencia-red.md`, `TC-081-001` a `TC-081-010` | No (JS puro, pero sin OTA igual exige build) |

## Política: cuándo generar el siguiente build

Cuando esta tabla acumule **3 o más filas pendientes**, o cuando cualquier fila individual sea
**bloqueante para una fecha comprometida** (ej. una ventana de instalación en tablets), Claude debe:

1. Señalarlo explícitamente al usuario en la conversación (no generar el build por su cuenta).
2. Proponer generar un build EAS `preview` que cubra todos los pendientes de la tabla a la vez.
3. Seguir la regla vigente (ver "Pendientes de build EAS" en `mobile/CLAUDE.md`): **nunca ejecutar
   `eas build` sin autorización explícita del usuario en esa misma instancia**, sin importar cuántas
   filas se hayan acumulado.
4. Al confirmarse el build, vaciar las filas cubiertas de esta tabla y registrar el `versionCode`
   resultante en el `docs/testing/test-NNN` correspondiente a cada cambio.

Esto no reemplaza el criterio de "1 build por ronda de pruebas" que ya sigue el ecosistema — es una
capa adicional para no gastar cuota en builds de un solo cambio JS cuando se puede esperar unas
horas o días a que se acumulen más.
