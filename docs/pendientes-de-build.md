# Pendientes de build EAS

> Registro de cambios de código ya committeados que **todavía no se han verificado en un build EAS
> real**, y que **exigen build nativo** (no alcanza con `eas update` por OTA — ver
> `mobile/docs/ota-updates.md` para el criterio de qué va por cada vía). El plan Free de EAS tiene
> cupo limitado (`https://expo.dev/accounts/{{cuenta}}/settings/billing`), así que no se genera un
> build por cada commit: se acumulan aquí hasta que valga la pena gastar uno.
>
> **Nota del spec 80 (2026-08-29):** las tablets de campo todavía no tienen `expo-updates`
> instalado — eso solo llega con el próximo build. Las filas de abajo son JS (o JS + migración
> SQLite) puro y, en cualquier build **posterior** a ese, se publicarían por OTA en vez de esperar
> aquí. Hoy siguen en esta tabla porque comparten el mismo build que instala el canal OTA (ver Fase 6
> del spec 80): agrupar es lo que evita gastar varias vueltas físicas por las tablets en vez de una.

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
| 3 | Consentimiento informado offline en mobile: pantalla/modal de consentimiento, caché del documento activo, cola de sync (`processConsentEntry`), aviso persistente en el orquestador y migración SQLite `0012_add_consent.sql`. `[DONE]`, pero sus casos mobile **solo se probaron en Expo Go** — nunca en un APK real | `d7b30f3`, `6ad2084`, `e988ff8`, `f90e151` | Spec 78 — repetir `TC-078-010, 011, 012, 013, 017, 020` en build real | No (JS + migración SQLite, sin dependencia nativa nueva) |

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
