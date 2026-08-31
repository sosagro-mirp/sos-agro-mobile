# Pendientes de build EAS

> Registro de cambios de código ya committeados que **todavía no se han verificado en un build EAS
> real** y que **exigen build nativo**. Desde el spec 80 el canal OTA es efectivo, así que un cambio
> puramente JS ya **no** entra aquí: se publica con `eas update`. El criterio de qué va por cada vía
> está en `mobile/docs/ota-updates.md`, junto con la trampa de las variables de entorno que costó un
> incidente real el 2026-08-30 (se publicó al canal de las tablets un bundle con la URL del backend
> de desarrollo incrustada).
>
> Entran en esta tabla: dependencias con código nativo, permisos, plugins de config, y cualquier
> cambio de `version` en `app.config.ts`.

## Estado actual — sin pendientes (2026-08-31)

**La tabla está vacía.** El build `versionCode 10014` (`8850317d-…`, 2026-08-29) cubrió las cinco
filas que había, y las cinco quedaron verificadas en dispositivo real (`SM-S931B`):

| Spec | Qué se verificó | Dónde consta |
|---|---|---|
| 76 | `TC-076-08`: logs agrupados por fecha y "Limpiar logs" sin resucitar el segmento | `docs/testing/test-076-arranque-tema-diagnostico.md` |
| 78 | Los 6 casos móviles del consentimiento, **contra producción** | `docs/testing/test-078-consentimiento-informado.md` |
| 80 | Ronda completa 10/10, incluidos sourcemaps y `ota_updates.is_enabled: true` | `docs/testing/test-080-expo-updates-canal-ota.md` |
| 81 | 9 aprobados, 1 no ejecutado por redundante | `docs/testing/test-081-resiliencia-red.md` |

La de spec 78 solo fue posible **después** de desplegar su backend ese mismo día: hasta entonces
`/api/consents` devolvía 404 en producción y la app no podía registrar ninguna constancia
(ver `docs/reports/deploys/01_plan_despliegue_specs_78_79.md`).

## Cuota de EAS

**Consultada el 2026-08-31** con `eas build:list`: **13 builds de Android en el ciclo de agosto**,
de los cuales 1 quedó `canceled` (no debería facturarse) y 2 `errored` — los dos intentos fallidos
del spec 80 (resolución de `@sentry/cli` bajo pnpm, y slug de proyecto incorrecto). **EAS cobra por
intento, no por resultado**: un build fallido gasta cupo igual que uno exitoso.

Plan Free: 15 Android + 15 iOS al mes, cupos independientes y no intercambiables. Quedan ~2-3
Android en este ciclo. Por eso existe la verificación previa obligatoria de `mobile/CLAUDE.md`
(§ "Verificación previa a un build EAS"): cada fallo evitable es cupo real perdido.

## Convención de esta lista

Cada fila es un cambio pendiente de verificar en dispositivo real. Se elimina de aquí (no se
archiva) en cuanto un build lo cubre y la ronda manual correspondiente lo confirma en
`docs/testing/`.

| # | Cambio | Commit | Spec / caso que lo verifica | Requiere build nativo (no solo JS) |
|---|--------|--------|------------------------------|--------------------------------------|
| — | *(sin pendientes)* | — | — | — |

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
