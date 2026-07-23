# [DONE] Spec 23 — Fix: pantalla muerta al presionar "Atrás" entre instrumentos

**Fecha:** 2026-07-23
**Última revisión:** 2026-07-23 (Fase 5 completada — 12/12 casos manuales aprobados, ver `docs/testing/20-test-spec23.md`)
**Repositorio afectado:** `mobile/` (únicamente)
**Rama:** `feature/spec23-navigation-fix`
**Prioridad:** Alta — bloqueante para el piloto de campo en curso (~25 encuestadores)
**Origen:** Bug diagnosticado en piloto real, no en desarrollo local.

---

## Contexto

Durante el piloto de campo real se reportó el siguiente síntoma: al completar
un instrumento dentro de una campaña y llegar a la pantalla "Comenzar" del
siguiente instrumento, si el encuestador presiona el botón **"Atrás" nativo
de Android** (no un botón de la app) **antes** de tocar "Comenzar", la app lo
lleva a una pantalla que dice **"No hay preguntas disponibles"** y queda **sin
ninguna acción disponible para salir** — pantalla muerta. La única salida es
forzar el cierre de la app.

### Causa raíz (verificada leyendo el código)

`expo-router` (`~6.0.24`, Expo SDK `~54`) usa un único `Stack` raíz definido en
`app/_layout.tsx` (líneas 132-148) — no hay stacks anidados por sección. Dentro
de ese stack, la navegación entre pantallas de un mismo instrumento se hace con
`router.push(...)`, que **apila** cada pantalla en el historial en lugar de
reemplazarla:

- `src/components/instrument/QuestionScreen.tsx` → `handleNext()` (línea 80):
  `router.push(\`/instrument/${instrumentId}/question/${currentIndex + 1}\`)`
  en cada avance de pregunta.
- `app/instrument/[id]/start.tsx` → `handleStart()` (línea 104):
  `router.push(\`/instrument/${id}/question/0\`)` al comenzar el instrumento.
- `app/instrument/[id]/question/[index].tsx` → `handleFinished()` (línea 35):
  `router.push(\`/instrument/${id}/review\`)` al terminar la última pregunta.

> **Restricción de diseño (verificada, no modificable en este spec):** el botón
> "Anterior" de `QuestionScreen.tsx` → `handlePrev()` (línea 86) navega con
> `router.back()`. Es decir, **el historial apilado por pregunta es el mecanismo
> real de "retroceder pregunta"**. Cualquier rediseño que convierta los `push`
> de pregunta en `replace` rompería "Anterior". Por eso la solución debe limpiar
> el historial **entre instrumentos**, nunca dentro de uno.

Mientras tanto, `app/campaign/[id]/session/[sessionId]/orchestrator.tsx` usaba
`router.replace(...)` para avanzar de instrumento en instrumento — pero
`replace()` en expo-router **solo reemplaza la entrada actual** del historial,
no las entradas por debajo. Se rastreó la secuencia completa de un ciclo
"instrumento A → instrumento B" dentro de una campaña:

```
pre-survey (push) → orchestrator#1
orchestrator#1 → replace → start(A)
start(A) → push → question/0(A) → push → question/1(A) → ... → push → question/N-1(A)
question/N-1(A) → push → review(A)
review(A) → replace → completed(A)          [instrument/[id]/completed.tsx]
completed(A) → replace → orchestrator#2     [handleContinue(), línea 25]
orchestrator#2 → replace → start(B)         [checkAndNavigate(), línea 220]
```

En cada paso marcado `replace`, solo se reemplaza la última pantalla activa.
Las entradas `start(A)`, `question/0(A)` … `question/N-1(A)` **nunca se
reemplazan ni se descartan** — quedan vivas por debajo de `start(B)` en el
historial nativo.

`app/instrument/[id]/completed.tsx` → `handleContinue()` (línea 18) llama
`reset()` sobre el store global `useInstrumentSurveyStore` **antes** de
navegar de vuelta al orchestrator. Ese store es único y global (no está
namespaced por instrumento ni por pantalla): cuando el usuario presiona
"Atrás" desde `start(B)` y expo-router lo devuelve a `question/N-1(A)` (la
entrada obsoleta más alta del historial de A), esa pantalla se **remonta**, y
su `useEffect` llama a `goToIndex(safeIdx)` leyendo `visibleQuestions()` del
store — que ya fue vaciado por `reset()` (`useInstrumentSurveyStore.ts`,
líneas 175-191). Con `flattenedQuestions` vacío, `visibleQuestions()` devuelve
`[]`, `safeIdx` se calcula como `0`, pero `visible[0]` es `undefined`.
`QuestionScreen.tsx` cae entonces en su rama `if (!currentItem)` (línea 89),
que renderiza únicamente el texto "No hay preguntas disponibles." **sin
ningún botón ni acción de salida**.

### Por qué `completed.tsx` es el punto de choque único

Se verificó que **todas** las transiciones instrumento-a-instrumento dentro de
una campaña (instrumento S1, instrumento S2 inyectado, y cada paso normal de
la campaña) pasan por `question/[index].tsx` → `review.tsx` → `completed.tsx`
→ de vuelta a `orchestrator.tsx`, sin excepción — incluida la inyección de S1
y S2, que también termina su encuesta por el mismo camino. Esto significa que
`completed.tsx` → `handleContinue()` es el **único lugar** por el que pasa
siempre la transición "instrumento terminado → siguiente paso", y por lo
tanto el punto correcto para descartar el historial acumulado del instrumento
que acaba de terminar, antes de que el orchestrator decida a dónde ir después.

`app/campaign/[id]/pre-survey.tsx` navega hacia el orchestrator con
`router.push(...)` (líneas 70 y 104) y **nunca se reemplaza ni se descarta**
durante todo el ciclo de vida de una sesión de campaña — permanece como la
pantalla estable más profunda del flujo, y es el ancla natural para el
descarte de historial.

---

## API real de expo-router — verificada contra el código fuente instalado

Por instrucción de `AGENTS.md` se consultó la documentación versionada; además,
tras la regresión (ver más abajo) se auditó **el código fuente real instalado**
en `node_modules`, que es la fuente de verdad para este repositorio:

| Fuente | Ruta |
|--------|------|
| Implementación de `dismissTo` | `node_modules/expo-router/build/global-state/routing.js:116` |
| Cola de navegación | `node_modules/expo-router/build/global-state/routing.js:67-96` |
| Flush de la cola | `node_modules/expo-router/build/imperative-api.js:25-27` |
| Reducer `POP_TO` | `@react-navigation/routers@7.6.0` → `src/StackRouter.tsx:585-679` |

Hallazgos verificados en el fuente:

1. `router.dismissTo(href)` es exactamente
   `linkTo(href, { event: 'POP_TO' })` → despacha la acción `POP_TO` del
   `StackRouter` de React Navigation.
2. **`dismissTo` NO consume ni descarta la pantalla destino.** Cuando encuentra
   la ruta en el historial (`index >= 0`), el reducer devuelve
   `routes: [...state.routes.slice(0, index), route]` — es decir, **conserva**
   la pantalla destino y la deja como tope del stack. La hipótesis registrada
   en la primera versión de este spec (que `dismissTo` consumía el ancla y por
   eso fallaba la segunda transición) queda **refutada**.
3. **El emparejamiento es por nombre de ruta, no por `href` completo ni por
   params.** El reducer compara `route.name === action.payload.name`, donde
   `name` es `campaign/[id]/pre-survey`. Los params (`id` de campaña) **no
   participan** del emparejamiento. Consecuencia práctica: pasar el
   `campaignId` correcto es deseable por los params de la pantalla destino,
   pero no es lo que hace que `dismissTo` encuentre el ancla.
4. **Fallback confirmado:** si el nombre de ruta no está en el historial, el
   reducer hace `state.routes.slice(0, currentIndex).concat(nuevaRuta)` — es
   decir, se comporta como `replace()` sobre la pantalla actual. No lanza error.
5. `dismissAll()` (`POP_TO_TOP`) sigue descartado como mecanismo: con un único
   `Stack` raíz volvería a la primera pantalla de **todo** el stack
   (`login`/`index`), no a `pre-survey`.
6. **Las llamadas al router se encolan, no se despachan de inmediato.**
   `routingQueue.add()` solo empuja la acción a un array; el `flush` real
   (`routingQueue.run`) ocurre dentro de un `useEffect` en la raíz del árbol
   (`imperative-api.js:25-27`). Como los efectos de los hijos corren **antes**
   que los del padre, **cualquier navegación disparada desde un `useEffect` de
   una pantalla montada se encola antes del flush y se aplica en orden — la
   última acción encolada gana.** Este punto es la clave de la regresión.

**Conclusión:** el mecanismo `dismissTo(pre-survey) + push(destino)` de las
Fases 1 y 2 es **correcto** y no es la causa de la regresión observada.

---

## Regresión encontrada en piloto en vivo — causa raíz corregida

> ⚠️ **Síntoma reportado (piloto en vivo, campaña con 2+ instrumentos sin
> condición de cultivo):** con las Fases 1-4 implementadas y `pnpm typecheck` /
> `lint` / `test` en verde, al completar el **primer** instrumento el usuario,
> en vez de llegar al segundo, es enviado a la **lista de campañas** (pestaña
> "Campañas"), sin poder continuar la campaña.

### Hipótesis original — **refutada**

La primera versión de este spec atribuyó la regresión a que
`router.dismissTo(href)` consumiría también la pantalla destino, dejando
`pre-survey` fuera del historial tras el primer uso. La lectura del reducer
`POP_TO` (punto 2 de la sección anterior) demuestra que **eso no ocurre**: la
ruta destino se conserva como tope del stack. Las Fases 1 y 2 no causan la
regresión.

### Causa raíz real — **la guarda defensiva de la Fase 3**

La regresión la introduce la Fase 3, no las Fases 1-2. Cadena verificada:

1. `app/_layout.tsx` declara un `Stack` nativo sin `freezeOnBlur`, y **en todo
   el repositorio no se llama `enableFreeze()`** (verificado por `grep` sobre
   `app/` y `src/`). Por tanto **todas las rutas presentes en el stack quedan
   montadas y reactivas**, no solo la enfocada: `question/0(A)` …
   `question/N-1(A)` siguen vivas por debajo mientras el usuario está en
   `completed(A)`.
2. `QuestionRoute` (`app/instrument/[id]/question/[index].tsx`, líneas 11 y 32)
   se **suscribe** a `s.instrumentId` del store global y lo incluye en las
   dependencias del `useEffect`. Es decir, el efecto se re-ejecuta en **cada
   pantalla de pregunta montada** cada vez que ese campo cambia.
3. `completed.tsx` → `handleContinue()` llama `reset()` (línea 18), que pone
   `instrumentId: null` (`useInstrumentSurveyStore.ts:182`), **antes** de
   navegar.
4. Ese cambio dispara el efecto en las N pantallas de pregunta obsoletas aún
   montadas. En todas, `activeInstrumentId (null) !== id (A)` → cada una
   ejecuta `router.replace("/(tabs)/campaign")`.
5. Por el punto 6 de la sección anterior, la cola de navegación termina siendo
   `[POP_TO pre-survey, PUSH orchestrator, REPLACE (tabs)/campaign × N]` y se
   despacha en ese orden. **Gana la última acción → pestaña "Campañas".**

Esto reproduce exactamente el síntoma reportado, y explica por qué falla
justo al completar el **primer** instrumento: es la primera vez que `reset()`
se ejecuta con pantallas de pregunta todavía montadas en el stack.

### Corolarios (corrigen afirmaciones de la versión anterior del spec)

- **La Fase 3 rompe el flujo por sí sola**, incluso sin las Fases 1-2: el
  `reset()` de `completed.tsx` existe también en `development`. La afirmación
  previa de que "las Fases 3 y 4 son aditivas y no comparten este riesgo" es
  **incorrecta** para la Fase 3. La Fase 4 sí es puramente aditiva (solo
  renderiza un botón; no navega desde un efecto).
- La guarda también habría roto el **flujo de retomar borrador** en cualquier
  escenario donde queden pantallas de pregunta de otro instrumento montadas en
  el stack: `drafts/index.tsx` llama `initializeSurvey(B)` (líneas 146-153)
  antes de su `push`, y ese cambio de `instrumentId` dispara la misma estampida
  de `router.replace` en las pantallas de A todavía montadas. La verificación
  de la Fase 5 (pendiente) lo habría detectado.
- `question/[index].tsx:22` es **el único** punto de todo el repositorio donde
  se navega desde un `useEffect` reaccionando a estado de un store global
  (verificado por `grep` de `router.(replace|push|dismissTo|back)` sobre `app/`
  y `src/`). El único otro efecto que navega es el `AuthGuard` de
  `_layout.tsx:41-56`, que ya está protegido con un `prevUserRef` para no
  disparar en re-renders.

### Estado de la rama

- La rama `feature/spec23-navigation-fix` fue **revertida de la sesión de
  piloto en vivo** (se volvió a `development`, donde el comportamiento es
  estable). El código de las Fases 1-4 sigue en la rama, sin mergear.
- La rama está **desactualizada respecto a `development`**: `development` ya
  integró `feature/spec-47-cultivo-sesion` (`farmerCache`, `sessionCropsStorage`,
  cambios en `schema.ts` y `SyncQueueService`). **Antes de volver a probar en
  dispositivo hay que traer `development` a la rama**, o la prueba se hará
  sobre una base distinta a la de producción.
- **No mergear a `development` hasta completar la Fase 6 y las Fases 5.**

---

## Alcance

**Incluye:**
- Limpieza real del historial de navegación al transicionar entre
  instrumentos dentro de una sesión de campaña (S1, S2, y cada paso normal),
  usando `router.dismissTo(...)`.
- Cobertura de **todos** los puntos de navegación de `orchestrator.tsx` que
  avanzan hacia un instrumento nuevo o hacia la pantalla de campaña completada,
  no solo el caso feliz (incluye rutas de duplicado: sobrescribir, saltar paso,
  y cancelar).
- Guarda defensiva en `question/[index].tsx` (`QuestionRoute`) ante un estado
  de store inconsistente con la ruta montada, como segunda capa de
  protección independiente de la limpieza de historial —
  **acotada a la pantalla enfocada** (ver Fase 6).
- Acción de salida en la pantalla "No hay preguntas disponibles" de
  `QuestionScreen.tsx`, como última red de seguridad si ambas capas
  anteriores no cubrieran un caso no previsto.
- Verificación explícita (no solo teórica) de que el flujo de retomar
  borrador y el flujo de forzar cierre + reabrir no se ven afectados.

**No incluye:**
- Cambios al modelo de datos SQLite ni migraciones Drizzle.
- Cambios al backend.
- Cambios al contenido o lógica de las preguntas (`QuestionRenderer`, tipos de
  pregunta).
- Convertir los `push` de pregunta en `replace`: rompería el botón "Anterior",
  que se apoya en `router.back()` (`QuestionScreen.tsx:86`).
- Spec 47 (cultivo de sesión) — spec distinto ya mergeado a `development`; no
  tocar sus archivos, solo integrarlos vía merge.
- Refactor del botón "Salir de la encuesta" en `QuestionScreen.tsx` (línea
  220, dentro del modal de confirmación, `router.replace("/(tabs)/campaign")`):
  se identificó como una fuente **relacionada pero distinta** de historial
  acumulado (si el usuario sale a mitad de un instrumento, `start(A)` y las
  preguntas ya visitadas tampoco se descartan). No está dentro del reporte
  original de este bug y su corrección requeriría decidir a qué pantalla anclar
  el `dismissTo` fuera del flujo de campaña. Se documenta como debt relacionado
  (`// DEBT:`) para un spec futuro, y queda parcialmente mitigado por la guarda
  defensiva de la Fase 3/6 de este mismo spec.
- Rama `else` de `completed.tsx` → `handleContinue()` (instrumento fuera de
  una campaña, `router.replace("/")`, línea 31) — no aplica al escenario
  reportado (encuesta dentro de campaña); no se toca en esta fase.

---

## Impacto en el sistema

- **Mobile — navegación:**
  - `src/lib/campaignNavigation.ts` — helper nuevo (`advanceWithinCampaign`,
    `returnToPreSurvey`) que encapsula `dismissTo(pre-survey) + push(destino)`.
  - `app/instrument/[id]/completed.tsx` — punto de choque único de la
    limpieza de historial (`handleContinue`).
  - `app/campaign/[id]/session/[sessionId]/orchestrator.tsx` — **16** puntos de
    navegación migrados (no 8, como decía la versión anterior de este spec):
    14 `advanceWithinCampaign` + 2 `returnToPreSurvey`. Desglose verificado:
    - **7 → instrumento nuevo:** líneas 97, 137, 183, 220, 352, 365, 429.
    - **7 → campaña completada:** líneas 156, 193, 289, 294, 314, 412, 423.
    - **2 → vuelta a `pre-survey`:** líneas 440 (`handleCancel`) y 533
      (botón "Volver a identificar" del estado `injection_error`).
  - `app/instrument/[id]/question/[index].tsx` (`QuestionRoute`) — guarda
    defensiva de consistencia ruta/store. **Es el archivo que introdujo la
    regresión; se rediseña en la Fase 6.**
  - `src/components/instrument/QuestionScreen.tsx` — rama `if (!currentItem)`
    (líneas 89-101) gana una acción de salida.
- **Mobile — estado:** ningún cambio de forma a `useInstrumentSurveyStore` ni
  a `useCampaignSessionStore`; solo se lee/valida su estado de forma
  defensiva desde `QuestionRoute`.
- **Base de datos:** sin impacto.
- **Backend:** sin impacto.
- **Frontend web:** sin impacto — este bug es específico de la acumulación de
  historial nativo de `expo-router`; la web no tiene un mecanismo de
  navegación por pila equivalente para este flujo.

---

## Evaluación MCP

**¿Aplica MCP?** No. Es un fix de navegación acotado a componentes existentes;
no involucra una fuente de datos ni una herramienta reutilizable que
justifique exponer un MCP.

---

## Fases de implementación

### Fase 1 — Limpieza de historial en el punto de choque (`completed.tsx`) ✅

- [x] En `app/instrument/[id]/completed.tsx` → `handleContinue()`, dentro de
      la rama `isInsideCampaign` (única rama en alcance), reemplazar la
      llamada `router.replace(orchestrator href)` por:
      1. `router.dismissTo(\`/campaign/${campaign.campaignId}/pre-survey\`)`
      2. `router.push(orchestrator href)` (mantener `push`, no `replace`, para
         no reemplazar la propia entrada de `pre-survey` recién alcanzada).
- [x] Documentar en el propio archivo (comentario breve, sin lógica nueva)
      por qué el ancla es `pre-survey` y no `dismissAll()`.
- [x] Confirmar el comportamiento de `dismissTo` — **verificado contra el
      código fuente instalado**, no solo contra la documentación (ver "API real
      de expo-router"). El mecanismo es correcto.

### Fase 2 — Cobertura de los puntos de transición en `orchestrator.tsx` ✅

- [x] Helper local nuevo `src/lib/campaignNavigation.ts` que encapsula
      "`dismissTo(pre-survey href)` + navegación final".
- [x] Aplicar el helper en los 7 puntos que avanzan a un **instrumento nuevo**.
- [x] Aplicar el helper en los 7 puntos que avanzan a la **pantalla de campaña
      completada** (`campaign/[id]/session/[sessionId]/completed.tsx`, distinta
      de `instrument/[id]/completed.tsx`).
- [x] Reemplazar `router.replace(pre-survey href)` por `returnToPreSurvey(...)`
      (sin push adicional, ya que el destino es el propio ancla) en
      `handleCancel` y en el botón "Volver a identificar" del estado
      `injection_error`.
- [x] Verificar que ninguno de estos cambios afecta el orden de las llamadas a
      API ni el guardado en `surveyDraftStore` / `syncQueue` — son
      exclusivamente cambios de navegación.

### Fase 3 — Guarda defensiva en `QuestionRoute` ⚠️ IMPLEMENTADA PERO DEFECTUOSA

- [x] Comparar el `id` (instrumentId) de la ruta contra `instrumentId` del
      store (`useInstrumentSurveyStore.instrumentId`, nombre confirmado en
      `useInstrumentSurveyStore.ts:20`).
- [x] Si no coinciden, redirigir con `router.replace("/(tabs)/campaign")`.
- [x] Confirmar que no interfiere con el flujo de reanudación de borrador —
      **verificación incompleta**: se comprobó que `drafts/index.tsx` llama
      `initializeSurvey(...)` (líneas 146-153) antes de su `router.push`, pero
      **no** se consideró el efecto del cambio de `instrumentId` sobre las
      pantallas de pregunta de *otro* instrumento aún montadas en el stack.
- [ ] ⚠️ **Defecto:** la guarda se ejecuta en **todas** las pantallas de
      pregunta montadas (no solo la enfocada) porque el efecto depende de un
      valor suscrito del store global. Al hacer `reset()`, N pantallas obsoletas
      encolan `router.replace("/(tabs)/campaign")` simultáneamente y secuestran
      la navegación. **Se corrige en la Fase 6.**

### Fase 4 — Última red de seguridad en `QuestionScreen.tsx` ✅

- [x] En la rama `if (!currentItem)` (líneas 89-101) agregar un
      `SecondaryButton` "Volver a campañas" que navegue a `/(tabs)/campaign`.
- [x] Mantener el texto actual ("No hay preguntas disponibles.") y solo añadir
      la acción, sin rediseñar la pantalla.
- [x] Verificado como puramente aditivo: solo renderiza; no navega desde un
      efecto, por lo que no puede disparar navegación en pantallas de fondo.

### Fase 6 — Corrección de la regresión (BLOQUEANTE, previa a la Fase 5) ✅

> Objetivo: que la guarda de la Fase 3 solo actúe cuando el usuario **realmente
> está viendo** la pantalla inconsistente, nunca desde una pantalla de fondo.
> Se mantiene el mecanismo `dismissTo + push` de las Fases 1-2 sin cambios: la
> auditoría del código fuente descarta que sea la causa.

- [x] Sincronizar la rama con `development` (merge) antes de tocar nada, para
      probar sobre la misma base que el piloto (`spec-47` ya está en
      `development`). Merge limpio, sin conflictos (`spec23.md` no se toca en
      `development`).
- [x] En `app/instrument/[id]/question/[index].tsx`, acotar la guarda a la
      pantalla enfocada usando `useFocusEffect` de `expo-router`, leyendo el
      `instrumentId` con `useInstrumentSurveyStore.getState()` **dentro** del
      callback en lugar de suscribirse a él con un selector.
      **Verificado contra el fuente de `useFocusEffect`
      (`node_modules/expo-router/build/useFocusEffect.js:91-162`):** el efecto
      externo depende de `[effect, navigation, optionalNavigation]`; si
      `effect` cambia de identidad mientras la pantalla no está enfocada
      (`navigation.isFocused()` falso), el callback **no se invoca** — solo se
      re-suscribe para el próximo `focus`. Esto confirma que el `reset()` de
      `completed.tsx` ejecutándose sobre pantallas de pregunta no enfocadas ya
      no dispara ninguna navegación desde ellas.
- [x] Mantener `goToIndex(safeIdx)` en el camino feliz con el mismo
      comportamiento actual (sin cambios de scope).
- [x] Verificar por lectura de código que, tras el cambio, **ningún**
      `useEffect` del repositorio navega reaccionando a estado global salvo el
      `AuthGuard` de `_layout.tsx` (ya protegido con `prevUserRef`).
      `app/instrument/[id]/download.tsx:13-15` también navega desde un
      `useEffect`, pero es un efecto de montaje único (`downloadAndCache(id)`)
      que no depende de un campo de store global — no comparte el patrón de
      la regresión.
- [x] **Endurecimiento opcional — evaluado y descartado por ahora:** mover
      `reset()` después de la navegación en `completed.tsx` reduciría la
      ventana de inconsistencia pero no sustituye la guarda enfocada (el caso
      original del bug — volver con "Atrás" a una pantalla ya reseteada —
      la sigue necesitando). Se deja fuera de esta spec para no tocar
      `completed.tsx` sin necesidad; queda como posible mejora futura, no
      como deuda (`// DEBT:`) porque no hay ningún escenario conocido que la
      requiera tras el fix de la Fase 6.
- [x] Ejecutar `pnpm typecheck`, `pnpm lint` y `pnpm test` — 0 errores de
      typecheck, 0 errores de lint (52 warnings preexistentes, ninguno en los
      archivos tocados), **9 suites / 143 tests** en verde (incluye
      `farmerCache.test.ts`, integrado por el merge de `development`).

### Fase 5 — Verificación de regresión en dispositivo (tras la Fase 6) ✅

> Ronda ejecutada el 2026-07-23 en desarrollo local (teléfono físico vía
> Expo Go, campaña "Apertura y Registro"). **12/12 casos aprobados, 0
> fallidos.** Detalle completo en `docs/testing/20-test-spec23.md`.

- [x] **Prueba de humo bloqueante:** completar el instrumento 1 de una campaña
      con 2+ instrumentos y confirmar que se llega al instrumento 2 (no a la
      pestaña "Campañas"). Este es el caso exacto que falló en el piloto.
      → TC-000 aprobado: llegó correctamente al segundo instrumento.
- [x] Confirmar que, tras completar un instrumento, "Atrás" desde el "Comenzar"
      del siguiente lleva a `pre-survey` y no a una pantalla muerta (objetivo
      original del spec). → TC-001/TC-002 aprobados.
- [x] Confirmar que el botón **"Anterior"** dentro de un instrumento sigue
      funcionando (depende de `router.back()`; ver "Restricción de diseño").
      → TC-006 aprobado.
- [x] Confirmar manualmente que el flujo de **retomar un borrador** (tab
      `drafts/` → reanudar encuesta interrumpida) sigue funcionando igual,
      **incluido el caso de reanudar un borrador de un instrumento distinto al
      de la última encuesta abierta en esa misma ejecución de la app** (ver
      corolarios de la regresión). → TC-007 y **TC-008** aprobados — TC-008 es
      la reproducción directa del corolario de la regresión y confirma que la
      guarda acotada por foco (Fase 6) lo resuelve.
- [x] Confirmar manualmente que **forzar cierre de la app a mitad de una
      encuesta y reabrir** sigue funcionando igual — el historial de
      navegación nativo se pierde al reiniciar el proceso, por lo que este
      caso es independiente de los cambios de esta spec, pero se confirma
      explícitamente como parte de la regresión. → TC-009 aprobado.
- [x] Casos adicionales también aprobados: duplicado sobrescribir/saltar/
      cancelar (TC-003/004/005), flujo feliz completo (TC-010), Atrás en
      pantalla de campaña completada (TC-011).
- [x] Ejecutar `pnpm typecheck` y `pnpm test` tras las Fases 1-4 — en verde
      (8 suites, 134 tests) al 2026-07-23.
- [x] Repetido tras la Fase 6 (merge de `development` + fix de `useFocusEffect`)
      — en verde (9 suites, 143 tests) al 2026-07-23.

---

## Criterios de aceptación

- Al completar un instrumento dentro de una campaña, el usuario llega al
  **siguiente instrumento** (o a la pantalla de campaña completada, según
  corresponda) — nunca a la lista de campañas.
- Al llegar a la pantalla "Comenzar" del siguiente instrumento, presionar
  "Atrás" nativo **antes** de tocar "Comenzar" lleva al usuario a `pre-survey`
  (o a la pantalla de la que legítimamente proviene), nunca a una pantalla
  muerta.
- Ninguno de los 16 puntos de navegación migrados en `orchestrator.tsx`
  (paso normal, inyección S1, inyección S2, sobrescribir duplicado, saltar
  duplicado, cancelar duplicado, error de inyección, y llegada a campaña
  completada) deja pantallas obsoletas del instrumento anterior alcanzables
  por "Atrás".
- **Ninguna pantalla no enfocada ejecuta navegación.** La guarda defensiva solo
  actúa sobre la pantalla que el usuario está viendo.
- Si por cualquier motivo no cubierto se llega —y se enfoca— una pantalla de
  pregunta con un `instrumentId` de ruta que no coincide con el store activo,
  el usuario es redirigido automáticamente en vez de ver una pantalla sin
  salida.
- Si aun así se llegara a la rama "No hay preguntas disponibles", el usuario
  tiene una acción visible para salir.
- El botón "Anterior" dentro de un instrumento sigue funcionando.
- El flujo de retomar un borrador funciona exactamente igual que antes de
  esta spec.
- El flujo de forzar cierre de la app a mitad de encuesta y reabrir funciona
  exactamente igual que antes de esta spec.
- `pnpm typecheck`, `pnpm lint` y `pnpm test` pasan sin errores nuevos.

---

## Pruebas manuales

Archivo: `docs/testing/20-test-spec23.md` (raíz del ecosistema).

- **TC-000** — Prueba de humo bloqueante: avance normal A→B (reproduce el
  síntoma exacto de la regresión).
- **TC-001 / TC-002** — Atrás nativo entre instrumentos, antes y después de
  "Comenzar" (una y varias veces).
- **TC-003 / TC-004 / TC-005** — Duplicado: sobrescribir, saltar, cancelar.
- **TC-006** — Botón "Anterior" dentro de un instrumento (regresión de
  `router.back()`).
- **TC-007 / TC-008** — Retomar borrador (mismo instrumento / instrumento
  distinto al último abierto en la misma ejecución — regresión de la guarda
  de la Fase 3/6).
- **TC-009** — Forzar cierre de la app a mitad de encuesta y reabrir.
- **TC-010** — Flujo feliz completo sin usar "Atrás".
- **TC-011** — Atrás nativo al llegar a la pantalla de campaña completada.
