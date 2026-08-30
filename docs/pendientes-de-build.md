# Pendientes de build EAS

> Registro de cambios de código ya committeados que **todavía no se han verificado en un build EAS
> real**, y que **exigen build nativo** (no alcanza con `eas update` por OTA — ver
> `mobile/docs/ota-updates.md` para el criterio de qué va por cada vía). El plan Free de EAS tiene
> cupo limitado (`https://expo.dev/accounts/{{cuenta}}/settings/billing`), así que no se genera un
> build por cada commit: se acumulan aquí hasta que valga la pena gastar uno.
>
> **Build `versionCode 10014` generado el 2026-08-29** (build `8850317d-…`, rama
> `deploy/preview-build-batch`) e instalado en el `SM-S931B`. Cubrió las 5 filas que había en esta
> tabla. Las filas 1, 2 y 5 ya se verificaron en dispositivo y **se retiraron**; queda solo lo que
> sigue sin comprobarse (ver abajo).
>
> **Desde este build, el canal OTA es efectivo en el dispositivo de pruebas**, así que los cambios
> puramente JS ya se publican con `eas update` en vez de esperar aquí — con la advertencia de
> variables de entorno documentada en `mobile/docs/ota-updates.md`, que costó un incidente real el
> 2026-08-30.

**Última consulta de cuota:** 2026-08-29 — plan Free, 15 Android + 15 iOS por mes (cupos
independientes, no intercambiables), **11/15 Android usados** este ciclo (quedan 4). Los 2 intentos
fallidos del spec 80 (resolución de `@sentry/cli` bajo pnpm, luego slug de proyecto incorrecto)
cuentan contra la cuota igual que uno exitoso — EAS cobra por intento, no por resultado.

## Convención de esta lista

Cada fila es un cambio pendiente de verificar en dispositivo real. Se elimina de aquí (no se
archiva) en cuanto un build lo cubre y la ronda manual correspondiente lo confirma en
`docs/testing/`.

| # | Cambio | Commit | Spec / caso que lo verifica | Requiere build nativo (no solo JS) |
|---|--------|--------|------------------------------|--------------------------------------|
| 1 | Consentimiento informado offline en mobile: pantalla/modal de consentimiento, caché del documento activo, cola de sync (`processConsentEntry`), aviso persistente en el orquestador y migración SQLite `0012_add_consent.sql`. `[DONE]`, pero sus casos mobile **solo se probaron en Expo Go** — nunca en un APK real | `d7b30f3`, `6ad2084`, `e988ff8`, `f90e151` | Spec 78 — repetir `TC-078-010, 011, 012, 013, 017, 020` en build real | Ya cubierto por el build 10014 — **falta ejecutar la ronda** |
| 2 | Canal OTA + sourcemaps de Sentry para bundles OTA — **parcialmente verificado**. ✅ Confirmado en dispositivo: `TC-080-002` (canal activo), `TC-080-005` (botón manual descarga y aplica, 3 veces), `TC-080-006`, `TC-080-010`. ⬜ Sin verificar: `TC-080-003` (`ota_updates.is_enabled` en Sentry — no hay eventos recientes, exige provocar un error controlado), `TC-080-004` (llegada automática en arranque en frío), `TC-080-007` (la recarga no atropella trabajo en curso), `TC-080-008` (crash simbolizado — **exige publicar un crash deliberado al canal de las tablets**), `TC-080-009` (rollback — el caso debe reinterpretarse: las publicaciones vivas son fixes reales del spec 81, no publicaciones de prueba) | `09ae322`, `87b9bc7`, `db1cdd7`, `b574690`, `e94b1df` | Spec 80 — `docs/testing/test-080-expo-updates-canal-ota.md` | Ya cubierto por el build 10014 — **falta cerrar la ronda** |

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
