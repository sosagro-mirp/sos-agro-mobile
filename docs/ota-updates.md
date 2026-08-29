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

```sh
eas update --channel preview --message "spec-NN: descripción corta del cambio"
```

Convención del `--message`: `spec-NN: qué cambia`, igual que los commits. El canal `preview` es el que usan las tablets de campo — cualquier publicación en él las alcanza a todas.

Para producción (cuando exista distribución formal fuera del piloto):

```sh
eas update --channel production --message "..."
```

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

**Estado actual (2026-08-29): pendiente.** La Fase 4 del spec 80 quedó bloqueada por falta de `SENTRY_AUTH_TOKEN` (requiere generarlo desde el dashboard de Sentry). Hasta que se registre ese secreto y se active `SENTRY_DISABLE_AUTO_UPLOAD: false` en `eas.json`, **cualquier publicación OTA que provoque un crash se investiga sin stack trace legible**. Retomar esta fase antes de depender del canal OTA para hotfixes complejos.
