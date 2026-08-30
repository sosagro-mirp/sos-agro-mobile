# Canal OTA (expo-updates)

> Spec 80. Desde que `expo-updates` está instalado y el bloque `updates` de
> `app.config.ts` es efectivo, la mayoría de los cambios de JS ya **no**
> necesitan un build EAS ni una vuelta física por las tablets: se publican por
> aire con `eas update`.

## Qué va por OTA y qué exige build nativo

**Va por OTA** (basta con `eas update`):

- Cambios de JavaScript/TypeScript: lógica, pantallas, estilos, textos.
- Cambios de assets empaquetados por Metro (imágenes referenciadas desde JS, fuentes cargadas con `expo-font`).
- Cualquier corrección que no toque `app.config.ts`, `eas.json`, plugins nativos ni dependencias nativas nuevas.

**Exige compilar e instalar un build nuevo** (`eas build` + instalación física, siempre como actualización, nunca reinstalando):

- Agregar o quitar una dependencia con código nativo (cualquier paquete con un módulo nativo, un config plugin, o que declare `expo-*` con parte nativa).
- Cambiar permisos de Android/iOS, el `package`/`bundleIdentifier`, íconos, splash nativo, o cualquier bloque de `app.config.ts` fuera de JS puro.
- **Subir el campo `version`** de `app.config.ts` — ver la regla de oro más abajo.
- Cambiar `eas.json` (perfiles, canales, variables de entorno de build).

Ante la duda: si el cambio se probaría en Expo Go sin problema, va por OTA. Si necesita un dev client o un build de release para probarse, exige build nativo.

## La regla de oro: no tocar `version`

Con `runtimeVersion: { policy: 'appVersion' }`, el campo `version` de `app.config.ts` **es** el runtime del canal OTA. Subirlo (p. ej. de `1.0.0` a `1.0.1`) sin compilar e instalar un APK nuevo con esa versión **corta el canal en silencio** para todo binario ya instalado: la publicación aparenta éxito, el servidor la sirve para el runtime nuevo, y ningún dispositivo en el runtime anterior la recibe jamás — sin error visible en ninguna parte.

**No modificar `version` salvo que en ese mismo cambio se vaya a compilar e instalar un build nativo nuevo en las tablets.** Si algún día se necesita cambiarlo por otro motivo (p. ej. alinear con una versión de la Play Store), hacerlo en el mismo commit que dispara el build EAS correspondiente, nunca antes.

## Publicar una actualización

> ⚠️ **Nunca uses el comando "simple"** (`eas update --channel preview -m "..."`)
> desde una máquina de desarrollo. Lee la trampa de las variables de entorno,
> justo abajo: rompe todas las tablets del canal, en silencio.

```sh
EXPO_NO_DOTENV=1 \
EXPO_PUBLIC_API_BASE_URL=https://sosagroapi.up.railway.app \
EXPO_PUBLIC_SENTRY_DSN="<el DSN del perfil preview en eas.json>" \
eas update --channel preview --clear-cache --message "spec-NN: descripción corta del cambio"
```

Convención del `--message`: `spec-NN: qué cambia`, igual que los commits. El canal `preview` es el que usan las tablets de campo — cualquier publicación en él las alcanza a todas.

### ⚠️ Trampa: `eas update` NO usa el `env` del perfil de `eas.json`

**Incidente real (2026-08-30, ronda manual del spec 81).** Se publicó un OTA
con el comando simple y **dejó la app inutilizable**: apuntando a
`http://192.168.1.57:3000` (el backend de desarrollo en la LAN de la máquina
que publicó) en vez de a producción. Síntoma en el dispositivo: "Sin conexión
a internet" en todas las pantallas, mientras el navegador del mismo teléfono
sí cargaba el backend. Sobrevive a reiniciar el teléfono y a desinstalar
cualquier VPN/bloqueador — porque no es un problema de red, es la URL
incrustada en el bundle. Diagnosticarlo tomó ~40 min de perseguir causas de
red inexistentes.

Tres cosas que hay que saber, y que se contradicen entre sí de forma poco intuitiva:

1. **`eas build` sí lee** el bloque `env` del perfil de `eas.json`
   (`"preview"` → `EXPO_PUBLIC_API_BASE_URL=https://sosagroapi.up.railway.app`).
   Lo dice en su salida: *"Environment variables loaded from the 'preview'
   build profile 'env' configuration"*.
2. **`eas update` NO lo lee.** Carga el `.env` **local** de la máquina
   (*"env: load .env"* en su salida), que en una máquina de desarrollo apunta
   al backend local. Las `EXPO_PUBLIC_*` se **incrustan en el bundle** al
   transformarlo, así que la URL equivocada viaja dentro del OTA.
3. **`.env` gana sobre la variable inline.** Poner
   `EXPO_PUBLIC_API_BASE_URL=... eas update` **no basta**: hay que desactivar
   la carga del `.env` con `EXPO_NO_DOTENV=1`. (Verificado exportando el
   bundle y buscando la URL dentro.)

Además, **`--clear-cache` no es opcional**: Metro cachea el módulo ya
transformado con el valor viejo incrustado, así que sin limpiar la caché
puedes publicar la URL anterior aunque las variables de entorno sean
correctas. También verificado en el mismo incidente.

### Verificar el bundle ANTES de dar por buena la publicación

`eas update` escribe el bundle exportado en `dist/`. Comprobar qué URL quedó
dentro es cuestión de un `grep` y es la única forma de detectar esto sin un
dispositivo:

```sh
grep -aoc "sosagroapi\.up\.railway\.app" dist/_expo/static/js/android/*.hbc   # debe dar ≥1
grep -aoc "192\.168\."                    dist/_expo/static/js/android/*.hbc   # debe dar 0
```

Hacerlo **siempre** tras publicar al canal `preview`, antes de pedirle a nadie
que aplique la actualización.

Para producción (cuando exista distribución formal fuera del piloto), mismo
patrón, cambiando el canal y las variables por las del perfil `production`.

## Verificar que llegó

1. En el dispositivo: cerrar la app por completo (deslizarla de recientes) y volver a abrirla. Si no se ve el cambio, repetir una vez más (hasta 2 arranques en frío).
2. O, sin esperar al arranque: en la pantalla de diagnóstico (5 toques en el título "Sos Agro 4.C"), bloque "Actualizaciones" → "Buscar actualización ahora" → "Reiniciar ahora".
3. Confirmar en el mismo bloque que el `updateId` cambió y que la fecha de publicación coincide.

## Camino de vuelta (rollback)

Si una publicación resulta problemática:

```sh
eas update:rollback
```

O, si se prefiere ser explícito, republicar el bundle anterior en el mismo canal (`eas update --channel preview --republish <update-id-anterior>`).

**Antes de publicar cualquier cambio al canal `preview`**, verificar primero en un dispositivo de prueba (no en las tablets de campo) cuando sea posible — no existe un canal de staging separado (ver limitación abajo), así que esa verificación manual es la única red de seguridad antes de tocar producción.

## Limitación conocida: no hay canal de staging

El APK instalado en las tablets de campo se compiló con el perfil `preview`, así que **publicar en `preview` impacta directamente los dispositivos de producción**. Este spec no crea un canal separado — habría exigido otro binario y otra vuelta de instalación física, que es justamente lo que este spec busca evitar para cambios de JS. Queda registrado como deuda en `spec/backlog.md`.

## Sourcemaps y diagnóstico en Sentry

Cada publicación genera un `updateId` propio. Sin sourcemaps subidos para ese bundle, un crash posterior llega a Sentry con líneas de un bundle minificado, no del código fuente — inservible para diagnosticar.

**Estado actual (2026-08-30): configurado, verificación pendiente.** `SENTRY_AUTH_TOKEN` está registrado como secreto de EAS (scope `org:ci`, visible en `preview` y `production`) y `SENTRY_DISABLE_AUTO_UPLOAD` ya está en `"false"` en ambos perfiles. Falta confirmarlo con un build real y una publicación OTA real (Fase 6 del spec 80): hasta esa verificación, sigue sin comprobarse que un crash de un bundle OTA llegue simbolizado.
