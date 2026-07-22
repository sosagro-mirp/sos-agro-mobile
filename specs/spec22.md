# [NOT STARTED] Spec 22 — Migración de `expo-av` a `expo-audio` (desbloqueo del build EAS)

**Fecha:** 2026-07-22
**Repositorio afectado:** `mobile/` (únicamente)
**Prioridad:** Alta — bloqueante del piloto de campo
**Spec relacionado:** `spec/46_endurecimiento_pre_despliegue_piloto_campo.md` (Fases 4 y 5 bloqueadas por este)

---

## Contexto

El 2026-07-22 se disparó el primer build EAS del repositorio
(`eas build --profile preview --platform android`, Fase 4.2 del Spec 46) y
**falló** con `EAS_BUILD_UNKNOWN_GRADLE_ERROR`. La causa raíz, extraída del log
completo, es:

```
CMake Error at CMakeLists.txt:13 (add_library):
  Target "expo-av" links to target "ReactAndroid::reactnativejni" but the
  target was not found.
```

`expo-av@14.0.7` no compila contra la New Architecture de React Native 0.81 /
Expo SDK 54, habilitada por defecto en este proyecto. La documentación oficial
de Expo confirma que `expo-av` está deprecado, **no recibe parches** y **se
elimina en el SDK 55**, reemplazado por `expo-audio` y `expo-video`.

Consecuencia operativa: **no existe ningún build instalable de la app**. Eso
bloquea la Fase 4 del Spec 46 (build EAS listo para los dispositivos) y, en
cascada, la Fase 5 (piloto multidispositivo con ~25 encuestadores en campo).
Es el único bloqueante duro entre el estado actual y el piloto.

Se evaluaron tres caminos:

| Opción | Evaluación |
|--------|------------|
| (a) Desactivar `newArchEnabled` como workaround | Descartada como solución. Va contra la dirección del SDK (la New Arch es obligatoria a partir del SDK 55), y solo aplaza el problema unas semanas, justo cuando la app ya esté en manos de 25 encuestadores. Se mantiene únicamente como plan de contingencia si la migración se complica (ver "Riesgos"). |
| (b) **Migrar a `expo-audio`** | **Elegida.** Es la ruta soportada, alinea el repo con el SDK 55 y elimina la deuda técnica ya documentada en el código. |
| (c) Eliminar la funcionalidad de voz | Descartada: la captura multimodal (voz) es una capacidad diferencial de la app móvil frente a la web, definida en el Spec 27. |

El propio código ya anticipaba esta migración con un comentario `// DEBT:` en
`src/components/inputs/VoiceRecordingInput.tsx:4`.

---

## Alcance

**Incluye:**

- Reemplazar la dependencia `expo-av` por `expo-audio` en `package.json`.
- Reemplazar el config plugin `expo-av` por `expo-audio` en `app.config.ts`.
- Reescribir la lógica de grabación y reproducción de
  `src/components/inputs/VoiceRecordingInput.tsx` sobre la API basada en hooks
  de `expo-audio`, **preservando su interfaz pública y su comportamiento
  funcional actual** (incluido el auto-stop a 300 s).
- Revisar la lista `android.permissions` de `app.config.ts` respecto al permiso
  de micrófono.
- Verificar la migración con un build EAS `preview` real que **complete con
  éxito** (criterio de éxito último del spec).
- Crear el archivo de pruebas manuales en dispositivo físico.
- Desbloquear las Fases 4 y 5 del Spec 46.

**No incluye:**

- Cambios en la UI o el diseño visual del componente de voz (mismos estados,
  mismos textos, mismos estilos).
- Cambios en el contrato con el backend: el `mimeType` sigue siendo
  `audio/m4a` y el archivo sigue guardándose en
  `${documentDirectory}media/voice/` (ver "Hallazgos de la documentación").
- Migración a `expo-video`: **no aplica**, no hay ningún uso de video en el
  repositorio (`expo-av` se importa en un único archivo, solo para audio).
- Cambios en `mediaUploadQueueStorage.ts`, `syncQueue` o el schema SQLite.
  El formato y el mime del archivo no cambian, así que la cola de subida de
  medios no se toca.
- Actualización general del SDK de Expo (54 → 55). Fuera de alcance; este spec
  solo prepara el terreno.
- Cambios en `backend/` o `frontend/`.

---

## Impacto en el sistema

**Superficie de uso de `expo-av` (verificada exhaustivamente — es toda):**

| Archivo | Línea(s) | Uso | Acción |
|---------|----------|-----|--------|
| `mobile/package.json` | 12 | `"expo-av": "~14.0.6"` | Reemplazar por `expo-audio` |
| `mobile/app.config.ts` | 61-66 | Plugin `['expo-av', { microphonePermission }]` | Reemplazar por `['expo-audio', { microphonePermission }]` |
| `mobile/app.config.ts` | 33-44 | `android.permissions` incluye `'MICROPHONE'` | Revisar (ver Fase 2) |
| `mobile/src/components/inputs/VoiceRecordingInput.tsx` | 1-119 | Único archivo de código que importa `expo-av` | Reescribir la lógica de audio |

**No impactado (verificado):**

- `src/components/instrument/QuestionRenderer.tsx:204` — consumidor del
  componente. Usa la interfaz `Props { questionId, value, onChange }`, que
  **debe preservarse intacta**; así el cambio no se propaga.
- `src/__tests__/`, `e2e/` y el `moduleNameMapper` de Jest en `package.json`:
  no existen tests ni mocks de `expo-av`. No hay que crear ni borrar mocks.
- `src/storage/mediaUploadQueueStorage.ts`, `src/storage/db/schema.ts`,
  `src/types/instrument.ts`: el payload (`mediaLocalPath`, `mimeType`) no
  cambia.
- `backend/src/media-attachments/`: el allowlist de mime types ya acepta
  `audio/m4a` (y `audio/mp4`). Como el formato de salida no cambia, **no se
  requiere ningún cambio en backend**.

---

## Hallazgos de la documentación oficial de Expo (SDK 54)

Consultado en `https://docs.expo.dev/versions/v54.0.0/sdk/audio/` y en el
código fuente de la rama `sdk-54` de `expo/expo`, conforme obliga `AGENTS.md`.
**Estos son los nombres reales; no asumir equivalencias de memoria.**

**Versión:** en la rama `sdk-54`, `expo-audio` está en `1.1.1`. La versión
compatible debe resolverla `npx expo install expo-audio`, nunca fijarse a mano.

**Equivalencias de API:**

| `expo-av` (actual) | `expo-audio` (destino) |
|--------------------|------------------------|
| `Audio.requestPermissionsAsync()` | `AudioModule.requestRecordingPermissionsAsync()` (también existe `getRecordingPermissionsAsync()`) |
| `Audio.setAudioModeAsync({ allowsRecordingIOS, playsInSilentModeIOS })` | `setAudioModeAsync({ allowsRecording, playsInSilentMode })` — importado **directamente** del módulo, ya no colgado de `Audio`. Las claves pierden el sufijo `IOS` |
| `Audio.RecordingOptionsPresets.HIGH_QUALITY` | `RecordingPresets.HIGH_QUALITY` |
| `Audio.Recording.createAsync(preset, statusCallback)` | Dos pasos separados: `useAudioRecorder(RecordingPresets.HIGH_QUALITY, statusListener?)` a nivel de componente, y luego `await recorder.prepareToRecordAsync()` seguido de `recorder.record()` |
| Callback de status con `durationMillis` | **No existe equivalente directo.** Ver "consideración crítica" abajo |
| `rec.stopAndUnloadAsync()` | `await recorder.stop()` |
| `rec.getURI()` | Propiedad `recorder.uri` (`string | null`) |
| `Audio.Sound.createAsync({ uri })` + `sound.playAsync()` | `useAudioPlayer(source)` a nivel de componente + `player.play()` |
| `sound.replayAsync()` | `await player.seekTo(0)` + `player.play()` |
| `sound.unloadAsync()` | `player.remove()` (o `player.replace(source)` para cambiar de fuente) |
| Plugin `expo-av` con `microphonePermission` | Plugin `expo-audio` con `microphonePermission` (iOS) y `recordAudioAndroid` (Android, por defecto `true` — inyecta `RECORD_AUDIO` en el manifest) |

**Consideración crítica — cómo se obtiene la duración en curso:**

El `statusListener` de `useAudioRecorder` **no es un callback de progreso**:
recibe un `RecordingStatus` con `{ id, isFinished, hasError, error, url }`,
sin duración. La duración se obtiene con el hook
`useAudioRecorderState(recorder, interval)`, que **hace polling** de
`recorder.getStatus()` cada `interval` ms (por defecto **500 ms**) y devuelve
un `RecorderState` con `{ isRecording, canRecord, durationMillis, url,
mediaServicesDidReset, metering? }`.

Esto cambia la forma del auto-stop: hoy vive dentro del callback de status
(con `autoStoppedRef` como guarda de reentrada); en `expo-audio` debe pasar a
ser un efecto que reaccione a `durationMillis` del estado devuelto por el
hook. El guard de reentrada **sigue siendo necesario** (el efecto puede
dispararse varias veces antes de que `isRecording` pase a `false`), y ya no
hace falta el workaround de "usar `rec` en vez del state", porque el recorder
del hook es una instancia estable entre renders.

Existe además `recorder.recordForDuration(seconds)`, que detendría solo a los
300 s. **No se recomienda como mecanismo principal**: hay un issue abierto en
`expo/expo` (#38402) sobre `recordForDuration` no actualizando correctamente
`recorderState`, y de todos modos el contador visible por segundo obliga a
tener el polling activo.

**Consideración — formato de salida:** el preset `HIGH_QUALITY` de
`expo-audio` produce extensión **`.m4a`** en ambas plataformas (Android:
`outputFormat: 'mpeg4'`, `audioEncoder: 'aac'`; iOS: `MPEG4AAC` con calidad
`MAX`). Por tanto **el nombre de archivo `${questionId}-${Date.now()}.m4a` y
el `mimeType: 'audio/m4a'` se mantienen sin cambios**, y no hay impacto en el
backend ni en la cola de subida de medios.

---

## Evaluación MCP

**¿Aplica MCP?** **No.**

Razonamiento: un MCP se justifica cuando hay datos o acciones del dominio que
un agente necesite consumir de forma repetida y estructurada (p. ej. consultar
instrumentos, campañas o el estado de la cola de sync). Este spec es una
**migración de dependencia interna**: no expone datos nuevos, no crea
endpoints, no cambia el contrato con el backend y no habilita ninguna
capacidad que un agente pudiera invocar. Su verificación depende de un build
nativo y de un dispositivo físico, dos cosas que un MCP no puede cubrir.
Adicionalmente, el inventario `docs/mcps/README.md` de `mobile/` está vacío y
este spec no cambia esa situación.

---

## Fases de implementación

### Fase 1 — Preparación y dependencias

> ⚠️ Instalar o desinstalar dependencias **requiere confirmación explícita del
> usuario en la misma sesión** (`mobile/CLAUDE.md`, "Acciones prohibidas").
> No ejecutar nada de esta fase sin ese visto bueno.

- [x] **1.1** Rama base resuelta. **Decisión del usuario:** el Spec 22 sale de
      `development`, se ejecuta ahí y al terminar se mergea a
      `feature/spec-46-hardening` para actualizarla. Ejecutado:
      1. Los cambios sueltos de la rama 46 (`app.config.ts` + `eas.json`:
         `projectId`/`owner` de EAS, `updates.url` real y
         `EXPO_PUBLIC_SENTRY_DSN` en los perfiles `preview`/`production`) se
         commitearon en `feature/spec-46-hardening` (`5912f6d`) para no
         arrastrarlos al cambiar de rama.
      2. Se creó `feature/spec-22-expo-audio` desde `development`.
      3. Se hizo **cherry-pick** de ese commit a la rama nueva (`873a00a`) —
         sin el `projectId` de EAS, el build de verificación de la Fase 5 no
         puede ejecutarse. Ambas ramas quedan con contenido idéntico en esos
         dos archivos, así que el merge final no debería conflictuar.
- [ ] **1.2** Confirmar con el usuario la instalación de `expo-audio` y la
      desinstalación de `expo-av`.
- [ ] **1.3** Instalar `expo-audio` con `npx expo install expo-audio` (deja que
      Expo resuelva la versión compatible con el SDK 54; no fijar la versión a
      mano).
- [ ] **1.4** Desinstalar `expo-av` y verificar que desaparece de `package.json`
      y del lockfile de pnpm.
- [ ] **1.5** Verificar con `grep` que no queda ninguna referencia a `expo-av`
      en el repositorio fuera de documentación histórica (specs, auditorías).

### Fase 2 — Configuración nativa (`app.config.ts`)

- [ ] **2.1** Reemplazar la entrada `['expo-av', { microphonePermission }]` del
      array `plugins` por `['expo-audio', { microphonePermission }]`,
      **conservando literalmente el mismo texto en español** del mensaje de
      permiso actual.
- [ ] **2.2** Evaluar si conviene declarar `recordAudioAndroid` de forma
      explícita. Por defecto es `true` y ya inyecta `RECORD_AUDIO` en el
      manifest; declararlo explícito es documentación, no funcionalidad.
- [ ] **2.3** Revisar `android.permissions`: la lista incluye la cadena
      `'MICROPHONE'`, que **no corresponde a ningún permiso real de Android**
      (el permiso real es `RECORD_AUDIO`, que el plugin agrega solo).
      Proponer al usuario reemplazarla por `'RECORD_AUDIO'` o eliminarla.
      **No modificar sin confirmación**: cambia el `AndroidManifest.xml`
      generado y, por tanto, los permisos que ve el encuestador al instalar.
- [ ] **2.4** No tocar `eas.json` en esta fase (regla explícita de
      `mobile/CLAUDE.md`); sus perfiles ya inyectan las variables correctas.

### Fase 3 — Reescritura de `VoiceRecordingInput.tsx`

> No es un find-replace de imports: `expo-av` es imperativo y `expo-audio` es
> basado en hooks, de modo que la creación del grabador y del reproductor sube
> al cuerpo del componente y deja de ocurrir dentro de los handlers.

- [ ] **3.1** Sustituir el import de `expo-av` por los símbolos de
      `expo-audio` identificados arriba (`useAudioRecorder`,
      `useAudioRecorderState`, `useAudioPlayer`, `AudioModule`,
      `setAudioModeAsync`, `RecordingPresets`). Mantener intactos los imports
      de `expo-file-system/legacy`, `lucide-react-native` y los tipos del
      dominio.
- [ ] **3.2** Eliminar el comentario `// DEBT:` de las líneas 4-7, que queda
      saldado con esta migración.
- [ ] **3.3** Preservar sin cambios la interfaz `Props`
      (`questionId`, `value`, `onChange`), el tipo `RecordingState`
      (`idle | recording | recorded`), la constante `VOICE_DIR`, la constante
      `MAX_DURATION_SECONDS = 300` y su comentario justificativo.
- [ ] **3.4** Instanciar el grabador con el hook a nivel de componente usando
      el preset `HIGH_QUALITY`, y el estado del grabador con el hook de estado.
      Definir el intervalo de polling explícitamente (el default de 500 ms
      basta para un contador en segundos; usar un valor menor solo si el
      usuario quiere un contador más fluido — ver "Decisiones pendientes").
- [ ] **3.5** Reemplazar el estado local `recording` (que hoy guarda la
      instancia `Audio.Recording`) por el `RecorderState` del hook. El estado
      `duration` en segundos pasa a derivarse de `durationMillis` en lugar de
      mantenerse en un `useState` propio; evaluar si conviene eliminarlo del
      estado local o mantenerlo para no reintroducir renders innecesarios.
- [ ] **3.6** Reescribir el inicio de grabación: pedir permiso de micrófono
      con el método de `AudioModule`, mantener la misma alerta en español si
      se deniega, aplicar el modo de audio con las claves **sin sufijo `IOS`**,
      preparar el grabador y luego iniciarlo. Mantener el `try/catch` con la
      alerta "No se pudo iniciar la grabación."
- [ ] **3.7** Reimplementar el **auto-stop a los 300 s** como efecto que
      observa la duración del `RecorderState`, conservando el `ref` de guarda
      contra doble disparo (renombrable, pero el comportamiento debe ser
      idéntico: una sola detención). Documentar en un comentario por qué el
      guard sigue siendo necesario con el modelo de polling.
- [ ] **3.8** Reescribir el fin de grabación: detener el grabador, revertir el
      modo de audio, leer la URI desde la **propiedad** `uri` del grabador,
      crear el directorio `media/voice/` si no existe, copiar el archivo con
      el mismo patrón de nombre `${questionId}-${Date.now()}.m4a` y emitir
      `onChange` con `mimeType: 'audio/m4a'`. Contemplar que `uri` puede ser
      `null` (misma salida temprana que hoy).
- [ ] **3.9** Reescribir la reproducción de preview con el hook de reproductor,
      alimentado por `value` cuando existe. Como el hook debe llamarse
      incondicionalmente, resolver el caso `value === undefined` (fuente nula o
      `replace` al cambiar de valor). El botón "Reproducir" debe reposicionar
      al inicio y reproducir, replicando el comportamiento de `replayAsync`.
- [ ] **3.10** Reescribir el borrado: liberar el reproductor con el método
      correspondiente, volver al estado `idle`, resetear el contador y emitir
      `onChange` con `mediaLocalPath` y `mimeType` en `undefined`.
- [ ] **3.11** Añadir limpieza al desmontar el componente (liberar reproductor
      y, si sigue grabando, detener el grabador). Hoy no existe; es una mejora
      barata que evita fugas cuando el encuestador navega a la siguiente
      pregunta a mitad de una grabación. **No ampliar el alcance más allá de
      esto.**
- [ ] **3.12** No tocar el bloque `StyleSheet.create` ni el JSX de los tres
      estados salvo lo estrictamente necesario para leer la nueva fuente de la
      duración. La UI debe quedar visualmente idéntica.

### Fase 4 — Verificación estática y de suite existente

- [ ] **4.1** `pnpm typecheck` sin errores.
- [ ] **4.2** `pnpm lint` sin errores nuevos.
- [ ] **4.3** `pnpm test` — la suite completa debe seguir en verde. No se
      esperan cambios (no hay tests de audio), pero `QuestionRenderer` es
      alcanzable desde el árbol de imports y una importación rota lo delataría.
- [ ] **4.4** Ejecutar `npx expo-doctor` y confirmar que no reporta
      dependencias incompatibles con el SDK 54 ni restos de `expo-av`.
- [ ] **4.5** Verificar que no se generó ni quedó pendiente ninguna migración
      Drizzle (no debe haberla: el schema SQLite no se toca).

### Fase 5 — Verificación del build nativo (criterio de éxito último)

> Esta es la fase que justifica el spec: el build que hoy falla debe pasar.

- [ ] **5.1** (Opcional, si hay Android SDK local) Ejecutar
      `npx expo prebuild --platform android --clean` y revisar el
      `AndroidManifest.xml` generado: debe contener `RECORD_AUDIO` y no debe
      quedar rastro del módulo `expo-av`. Limpiar después los artefactos de
      prebuild para no ensuciar el repositorio.
- [ ] **5.2** Confirmar explícitamente con el usuario antes de disparar el
      build (consume cuota de EAS y ~15-20 min).
- [ ] **5.3** Ejecutar `eas build --profile preview --platform android`.
- [ ] **5.4** Si falla, descargar y revisar el log completo (viene comprimido
      con Brotli, como en el intento del Spec 46) e identificar la causa raíz
      antes de reintentar. **Reportar al usuario antes de improvisar
      soluciones** (por ejemplo, desactivar la New Architecture).
- [ ] **5.5** Con el build exitoso, confirmar en el log/artefacto que la URL
      del backend embebida es `https://sosagroapi.up.railway.app` y que
      `EXPO_PUBLIC_SENTRY_DSN` viajó (esto cierra el paso **4.3 del Spec 46**).
- [ ] **5.6** Registrar el resultado en el Spec 46: marcar 4.2 y 4.3 y
      desbloquear su Fase 5.

### Fase 6 — Pruebas manuales en dispositivo físico

> ⚠️ **La grabación y la reproducción de audio no son verificables desde esta
> sesión ni desde un emulador.** El emulador de Android no tiene micrófono real
> (o enruta el del host de forma poco fiable), la permission dialog nativa no
> se puede automatizar y Expo Go no ejerce el mismo código nativo que el build
> de EAS. **Toda la validación funcional de esta migración es manual, sobre el
> APK de la Fase 5, en un dispositivo Android físico.** No marcar el spec como
> `[DONE]` apoyándose en typecheck/lint/tests: esos solo prueban que compila.

- [ ] **6.1** Crear `docs/testing/18-test-spec22.md` (siguiente número libre:
      el último existente es `17-test-piloto-multidispositivo.md`), con el
      formato de casos `TC-001`, `TC-002`, … del `CLAUDE.md` raíz.
- [ ] **6.2** Casos mínimos a cubrir en ese archivo:
      - Primera grabación en una instalación limpia: aparece el diálogo de
        permiso de micrófono con el texto en español configurado.
      - Denegar el permiso: aparece la alerta "Permiso requerido" y no se
        inicia la grabación.
      - Grabar ~10 s: el contador avanza en segundos y el badge "Grabando…"
        se muestra correctamente.
      - Detener manualmente: la UI pasa a "Grabación lista".
      - Reproducir la preview: se oye el audio grabado.
      - Reproducir dos veces seguidas: la segunda vez suena desde el inicio
        (equivalente al `replay` anterior).
      - Eliminar: vuelve al estado inicial y la respuesta queda vacía.
      - **Auto-stop:** grabar más de 5 minutos y verificar que se detiene solo
        una vez, exactamente una, y que el archivo queda utilizable.
      - Salir de la pregunta a mitad de una grabación y volver: sin crash.
      - Guardar el borrador, matar la app, reabrir y verificar que la
        grabación sigue asociada a la pregunta (persistencia del
        `mediaLocalPath`).
      - Con la encuesta completada y conexión disponible: el audio se sube y
        la cola de medios queda vacía (valida de punta a punta que el
        `mimeType` sigue siendo aceptado por el backend).
      - Repetir al menos los casos de grabar/reproducir en modo avión, para
        confirmar que nada del flujo de audio depende de la red.
- [ ] **6.3** Cambiar el estado del spec a `[TESTING]`.
- [ ] **6.4** El usuario ejecuta los casos y reporta resultados; marcarlos
      ✅/❌ en el archivo de pruebas a medida que los confirme.

### Fase 7 — Cierre

- [ ] **7.1** Commit(s) siguiendo Conventional Commits en inglés, por ejemplo
      `refactor(audio): migrate VoiceRecordingInput from expo-av to expo-audio`
      y `chore(deps): replace expo-av with expo-audio`.
- [ ] **7.2** Invocar `@reviewer` sobre el cambio; el informe se persiste en
      `docs/reports/auditorias/` con la numeración secuencial que corresponda.
- [ ] **7.3** Con todos los casos de `18-test-spec22.md` aprobados, marcar este
      spec como `[DONE]`.
- [ ] **7.4** Merge a `development` y borrado inmediato de la rama.
- [ ] **7.5** Retomar la Fase 5 del Spec 46 (piloto multidispositivo), ya
      desbloqueada.

---

## Criterios de aceptación

1. `expo-av` no aparece en `package.json`, en el lockfile, en `app.config.ts`
   ni en ningún archivo de `src/` o `app/`.
2. `eas build --profile preview --platform android` **completa con éxito** y
   produce un APK instalable. Este es el criterio que motiva el spec.
3. `pnpm typecheck`, `pnpm lint` y `pnpm test` pasan sin errores nuevos.
4. La interfaz pública de `VoiceRecordingInput` (`questionId`, `value`,
   `onChange`) es idéntica y `QuestionRenderer.tsx` no requirió ningún cambio.
5. En dispositivo físico: el encuestador puede grabar, ver el contador,
   detener, reproducir, reproducir de nuevo desde el inicio y eliminar una
   respuesta de voz.
6. El auto-stop a 300 s se dispara **exactamente una vez** y deja un archivo
   válido.
7. El archivo generado sigue siendo `.m4a` en
   `${documentDirectory}media/voice/` y se envía con `mimeType: 'audio/m4a'`;
   la subida al backend funciona sin cambios del lado del servidor.
8. La app sigue pidiendo el permiso de micrófono con el mensaje en español ya
   definido.
9. Las Fases 4 y 5 del Spec 46 quedan desbloqueadas y su Fase 4.3 confirmada.

---

## Pruebas e2e

**No aplica `@tester` automatizado para esta migración.** El flujo e2e de
Maestro (`e2e/pollster-flow.yaml`) no cubre — ni puede cubrir de forma fiable —
la captura de audio: requiere diálogos de permisos nativos y un micrófono real.
La validación es la del archivo `docs/testing/18-test-spec22.md` (Fase 6).

Sí debe verificarse que el flujo e2e existente **sigue pasando sin cambios**,
ya que no toca preguntas de tipo `voice_recording`.

---

## Riesgos identificados

| # | Riesgo | Mitigación |
|---|--------|------------|
| 1 | El build EAS vuelve a fallar por otra dependencia incompatible con la New Architecture que quedaba oculta detrás del fallo de `expo-av` (el build aborta en el primer error de CMake). | Fase 5.4: leer el log completo antes de reintentar. `npx expo-doctor` (4.4) puede adelantar parte del diagnóstico. Presupuestar la posibilidad de un segundo ciclo de build. |
| 2 | El contador de duración se vuelve menos preciso: `expo-audio` hace **polling** (500 ms por defecto) en vez de recibir callbacks del módulo nativo. El auto-stop podría dispararse hasta medio segundo tarde. | Irrelevante funcionalmente sobre un tope de 300 s. Si molesta, bajar el intervalo del hook (a costa de más renders). |
| 3 | Issues abiertos en `expo/expo` sobre el estado del grabador no actualizándose en algunas versiones de `expo-audio` (#37902, #38402). | Dejar que `npx expo install` resuelva la versión alineada con el SDK 54 (`1.x` en la rama `sdk-54`) en vez de fijarla a mano. El caso TC del auto-stop en dispositivo físico es precisamente la prueba que detectaría este fallo. |
| 4 | Los hooks de `expo-audio` deben invocarse incondicionalmente, pero el componente tiene tres estados y `value` puede ser `undefined`. Un `useAudioPlayer` mal ubicado rompe las reglas de hooks o crea reproductores huérfanos. | Paso 3.9 explícito, más la limpieza al desmontar del 3.11. |
| 5 | La migración se valida solo en Android (el piloto es Android). Un comportamiento distinto en iOS quedaría sin detectar. | Aceptable: el piloto y los builds son Android (`eas.json` solo define perfiles Android). Documentarlo como riesgo conocido si en el futuro se publica en iOS. |
| 6 | Presión de calendario: el piloto con ~25 encuestadores depende de esto y la validación exige un dispositivo físico que puede no estar disponible de inmediato (mismo bloqueo que ya sufrió la Fase 5 del Spec 46). | Ver "Decisiones pendientes" #4. Contingencia extrema en #7. |
| 7 | La migración se complica más de lo previsto y el piloto se retrasa. | Contingencia (no solución): desactivar temporalmente `newArchEnabled` para obtener un build con `expo-av`. Solo con aprobación explícita del usuario, documentado como deuda con fecha límite en el SDK 55, y sin cancelar este spec. |
| 8 | El trabajo del Spec 46 (`app.config.ts` y `eas.json` modificados y sin commitear en `feature/spec-46-hardening`) se pierde o entra en conflicto al crear la rama nueva. | Paso 1.1: resolver con el usuario **antes** de tocar nada. |

---

## Decisiones pendientes del usuario (antes de empezar)

1. ~~**Rama base.**~~ ✅ **Resuelta.** El Spec 22 sale de `development`
   (`feature/spec-22-expo-audio`), se ejecuta ahí y se mergea después a
   `feature/spec-46-hardening`. Ver paso 1.1 para el detalle de lo ejecutado.
2. **Dependencias.** Confirmación explícita para instalar `expo-audio` y
   desinstalar `expo-av`.
3. **Permiso `'MICROPHONE'` en `android.permissions`.** ¿Se reemplaza por
   `'RECORD_AUDIO'`, se elimina, o se deja como está? Cambia el manifest y,
   con él, la pantalla de permisos que ve el encuestador al instalar el APK.
4. **Dispositivo físico.** ¿Habrá un Android real disponible para ejecutar
   `18-test-spec22.md`? Si no, decidir si el piloto arranca con la migración
   verificada solo a nivel de build (riesgo asumido y documentado) o si se
   espera.
5. **Intervalo del contador.** ¿500 ms (default de Expo, menos renders) o un
   valor menor para un contador más fluido? Recomendación: dejar el default.
6. **Estado del Spec 46.** ¿Se mantiene en `[IN PROGRESS]` esperando a este
   spec, o se cierra en `[TESTING]` con sus Fases 4-5 marcadas como
   dependientes del Spec 22?
