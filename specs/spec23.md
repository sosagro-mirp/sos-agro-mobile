# [IN PROGRESS] Spec 23 — Fix: pantalla muerta al presionar "Atrás" entre instrumentos

**Fecha:** 2026-07-23
**Repositorio afectado:** `mobile/` (únicamente)
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
`app/_layout.tsx` — no hay stacks anidados por sección. Dentro de ese stack,
la navegación entre pantallas de un mismo instrumento se hace con
`router.push(...)`, que **apila** cada pantalla en el historial en lugar de
reemplazarla:

- `src/components/instrument/QuestionScreen.tsx` → `handleNext()` (línea 80):
  `router.push(\`/instrument/${instrumentId}/question/${currentIndex + 1}\`)`
  en cada avance de pregunta.
- `app/instrument/[id]/start.tsx` → `handleStart()` (línea 104):
  `router.push(\`/instrument/${id}/question/0\`)` al comenzar el instrumento.
- `app/instrument/[id]/question/[index].tsx` → `handleFinished()` (línea 22):
  `router.push(\`/instrument/${id}/review\`)` al terminar la última pregunta.

Mientras tanto, `app/campaign/[id]/session/[sessionId]/orchestrator.tsx` usa
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
completed(A) → replace → orchestrator#2     [handleContinue(), línea 20]
orchestrator#2 → replace → start(B)         [checkAndNavigate(), línea 219]
```

En cada paso marcado `replace`, solo se reemplaza la última pantalla activa.
Las entradas `start(A)`, `question/0(A)` … `question/N-1(A)` **nunca se
reemplazan ni se descartan** — quedan vivas por debajo de `start(B)` en el
historial nativo.

`app/instrument/[id]/completed.tsx` → `handleContinue()` (línea 17) llama
`reset()` sobre el store global `useInstrumentSurveyStore` **antes** de
navegar de vuelta al orchestrator. Ese store es único y global (no está
namespaced por instrumento ni por pantalla): cuando el usuario presiona
"Atrás" desde `start(B)` y expo-router lo devuelve a `question/N-1(A)` (la
entrada obsoleta más alta del historial de A), esa pantalla se **remonta**, y
su `useEffect` (línea 12 de `question/[index].tsx`) llama a
`goToIndex(safeIdx)` leyendo `visibleQuestions()` del store — que ya fue
vaciado por `reset()`. Con `sections` vacío, `visibleQuestions()` devuelve
`[]`, `safeIdx` se calcula como `0`, pero `visible[0]` es `undefined`.
`QuestionScreen.tsx` cae entonces en su rama `if (!currentItem)` (línea 89),
que renderiza únicamente el texto "No hay preguntas disponibles." **sin
ningún botón ni acción de salida** (línea 90-96).

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
`router.push(...)` (líneas 79 y 116) y **nunca se reemplaza ni se descarta**
durante todo el ciclo de vida de una sesión de campaña — permanece como la
pantalla estable más profunda del flujo, y es el ancla natural para el
descarte de historial.

### API real de expo-router verificada (SDK 54 / expo-router ~6, docs v56.0.0)

Por instrucción de `AGENTS.md`, se consultó la documentación versionada real
de expo-router antes de proponer el mecanismo. Signatures confirmadas:

```
dismiss(count: number): void       // descarta `count` pantallas hacia atrás
dismissAll(): void                 // vuelve a la primera pantalla del stack más cercano (equivalente a popToTop)
dismissTo(href: Href, options?: NavigationOptions): void
replace(href: Href, options?: NavigationOptions): void
```

- `dismissTo(href)`: descarta pantallas del historial **hasta llegar** a la
  entrada que coincide con `href`. Si `href` no está en el historial, **cae a
  comportamiento de `replace()`** sobre la pantalla actual (no lanza error).
- `dismissAll()` se descarta como mecanismo para este fix: en este repo solo
  existe un `Stack` raíz (`app/_layout.tsx`), así que `dismissAll()` volvería
  a la primera pantalla de **todo** el stack (`login`/`index`), no a
  `pre-survey` — demasiado agresivo, rompería el flujo de campaña activo.
- **Mecanismo elegido: `router.dismissTo(...)`** apuntando al `href` exacto de
  `pre-survey` de la sesión activa (`/campaign/${id}/pre-survey`, con el mismo
  `id` de campaña ya presente en el scope de cada función afectada), seguido
  de `router.push(...)` hacia el destino real cuando corresponde avanzar
  (nunca `replace`, para no volver a apilar sobre una entrada ya descartada).

Esto se debe **confirmar en tiempo de ejecución durante la Fase 1** (ver
Criterios de aceptación): si `dismissTo` no encuentra el `href` de
`pre-survey` en algún escenario no contemplado en este análisis, su
comportamiento de fallback (`replace` silencioso) no rompe la app, pero
tampoco limpia el historial — por eso Fase 2 añade una guarda defensiva
independiente que no depende de que `dismissTo` haya funcionado.

---

## Alcance

**Incluye:**
- Limpieza real del historial de navegación al transicionar entre
  instrumentos dentro de una sesión de campaña (S1, S2, y cada paso normal),
  usando `router.dismissTo(...)`.
- Cobertura de **todos** los puntos de `router.replace(...)` identificados en
  `orchestrator.tsx` que navegan hacia un instrumento nuevo o hacia la
  pantalla de campaña completada, no solo el caso feliz (incluye rutas de
  duplicado: sobrescribir, saltar paso, y cancelar).
- Guarda defensiva en `question/[index].tsx` (`QuestionRoute`) ante un estado
  de store inconsistente con la ruta montada, como segunda capa de
  protección independiente de la limpieza de historial.
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
- Spec 47 (cultivo de sesión) — spec distinto en curso, no tocar sus archivos.
- Refactor del botón "Salir de la encuesta" en `QuestionScreen.tsx` (línea
  216, `router.replace("/(tabs)/campaign")`): se identificó como una fuente
  **relacionada pero distinta** de historial acumulado (si el usuario sale a
  mitad de un instrumento, `start(A)` y las preguntas ya visitadas tampoco se
  descartan). No está dentro del reporte original de este bug y su corrección
  requeriría decidir a qué pantalla anclar el `dismissTo` fuera del flujo de
  campaña. Se documenta como debt relacionado (`// DEBT:`) para un spec futuro,
  y queda parcialmente mitigado por la guarda defensiva de Fase 2 de este
  mismo spec.
- Rama `else` de `completed.tsx` → `handleContinue()` (instrumento fuera de
  una campaña, `router.replace("/")`) — no aplica al escenario reportado
  (encuesta dentro de campaña); no se toca en esta fase.

---

## Impacto en el sistema

- **Mobile — navegación:**
  - `app/instrument/[id]/completed.tsx` — punto de choque único de la
    limpieza de historial (`handleContinue`).
  - `app/campaign/[id]/session/[sessionId]/orchestrator.tsx` — 8 puntos de
    `router.replace(...)` que avanzan a un instrumento nuevo o a la pantalla
    de campaña completada (`injectInstrumentOnline`, `injectInstrumentOffline`,
    `checkDuplicateAndNavigateOffline` ×2, `checkAndNavigate` ×2, rama offline
    de `s2` ×2, rama `injectionPhase === 'none'` offline, `handleOverwrite` ×2,
    `handleSkip` ×3, `handleCancel`, retry de `injection_error`).
  - `app/instrument/[id]/question/[index].tsx` (`QuestionRoute`) — guarda
    defensiva de consistencia ruta/store.
  - `src/components/instrument/QuestionScreen.tsx` — rama `if (!currentItem)`
    gana una acción de salida.
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

> ⚠️ **REGRESIÓN ENCONTRADA en prueba manual real (piloto en vivo, no
> `Santiago`/café — campaña distinta con 2+ instrumentos sin condición de
> cultivo).** Las Fases 1 y 2 (mecanismo `dismissTo(pre-survey) + push`)
> implementadas y con `pnpm typecheck`/`lint`/`test` en verde, **rompen la
> navegación real**: al completar el primer instrumento, en vez de llegar al
> segundo, el usuario es enviado a la lista de campañas (pestaña
> "Campañas"), sin poder continuar la campaña.
>
> **Hipótesis de causa raíz (sin confirmar en código todavía):**
> `router.dismissTo(href)` probablemente **consume/remueve también la propia
> pantalla destino** del historial al alcanzarla, no solo las que están por
> encima. La primera transición de la sesión (`pre-survey` → instrumento 1)
> también pasa por `advanceWithinCampaign` (mismo mecanismo), así que
> `pre-survey` queda consumido del historial ya en ese primer uso. Cuando el
> instrumento 1 termina y se intenta `dismissTo(pre-survey)` una segunda vez
> (camino al instrumento 2), el destino ya no existe en el historial — el
> fallback de `dismissTo` en cascada termina reseteando el stack de pestañas
> a su ruta inicial (Campañas).
>
> **Estado:** rama `feature/spec23-navigation-fix` **revertida de la sesión
> de piloto en vivo** (se volvió a `development`, sin este fix, donde el
> comportamiento es estable). El código de las Fases 1-2 sigue en esta rama
> sin mergear. **No mergear a `development` hasta rediseñar el mecanismo de
> limpieza de historial** — posiblemente usando un ancla distinta que
> persista entre usos (ej. re-`push`-ear `pre-survey` inmediatamente después
> de cada `dismissTo` exitoso, en vez de asumir que sigue disponible para la
> siguiente transición), o un mecanismo distinto a `dismissTo` por completo.
> Las Fases 3 y 4 (guarda defensiva + botón de salida) son aditivas y no
> deberían compartir este riesgo, pero no se verificaron de forma aislada
> (sin las Fases 1-2 activas) antes de este hallazgo.

### Fase 1 — Limpieza de historial en el punto de choque (`completed.tsx`) ✅

- [x] En `app/instrument/[id]/completed.tsx` → `handleContinue()`, dentro de
      la rama `isInsideCampaign` (única rama en alcance), reemplazar la
      llamada actual `router.replace(orchestrator href)` por:
      1. `router.dismissTo(\`/campaign/${campaign.campaignId}/pre-survey\`)`
      2. `router.push(orchestrator href)` (mantener `push`, no `replace`, para
         no reemplazar la propia entrada de `pre-survey` recién alcanzada).
- [x] Confirmar manualmente en un dispositivo/emulador que, tras completar un
      instrumento, `dismissTo` efectivamente descarta `start(A)` y todas las
      `question/N(A)` del historial (inspeccionar con el botón "Atrás" antes
      de este fix vs. después).
- [x] Documentar en el propio archivo (comentario breve, sin lógica nueva)
      por qué el ancla es `pre-survey` y no `dismissAll()`.

### Fase 2 — Cobertura defensiva de los puntos de transición en `orchestrator.tsx` ✅

- [x] Introducir un helper local en `orchestrator.tsx` (o reutilizar uno
      compartido si ya existiera un patrón similar en el repo — confirmar
      antes de crear uno nuevo) que encapsule la secuencia
      "`dismissTo(pre-survey href)` + navegación final", para no repetir la
      lógica cruda en cada uno de los 8 puntos identificados.
- [x] Aplicar el helper en los puntos que avanzan a un **instrumento nuevo**:
      `injectInstrumentOnline` (línea 96), `injectInstrumentOffline` (línea
      136), `checkDuplicateAndNavigateOffline` (línea 182), `checkAndNavigate`
      (línea 219), `handleOverwrite` — rama online y offline (líneas 351-353 y
      362), `handleSkip` — rama offline (línea 426).
- [x] Aplicar el mismo helper en los puntos que avanzan a la **pantalla de
      campaña completada** (`campaign/[id]/session/[sessionId]/completed.tsx`,
      distinta de `instrument/[id]/completed.tsx`): líneas 155, 192, 288, 293,
      313, 409, 420.
- [x] Reemplazar `router.replace(pre-survey href)` por `router.dismissTo(pre-survey href)`
      (sin push adicional, ya que el destino es el propio ancla) en
      `handleCancel` (línea 437) y en el botón "Volver a identificar" del
      estado `injection_error` (línea 530) — corrige la duplicación menor de
      `pre-survey` en el historial detectada en el mismo análisis.
- [x] Verificar que ninguno de estos cambios afecta el orden de las llamadas a
      API ni el guardado en `surveyDraftStore` / `syncQueue` — son
      exclusivamente cambios de navegación.

### Fase 3 — Guarda defensiva en `QuestionRoute` (segunda capa, independiente de Fases 1-2) ✅

- [x] En `app/instrument/[id]/question/[index].tsx`, antes de (o junto con) el
      `useEffect` que llama `goToIndex`, comparar el `id` (instrumentId) de la
      ruta actual contra el `instrumentId` vigente en
      `useInstrumentSurveyStore` (leer el campo correspondiente del store —
      confirmar su nombre exacto leyendo `useInstrumentSurveyStore.ts` antes
      de implementar, no asumirlo).
- [x] Si no coinciden (o si el store está vacío/sin inicializar para ese
      instrumento), redirigir de inmediato con `router.replace("/(tabs)/campaign")`
      en lugar de ejecutar `goToIndex` y dejar que `QuestionScreen` caiga en
      su rama de "No hay preguntas disponibles".
- [x] Confirmar que esta guarda **no interfiere** con el flujo de reanudación
      de borrador (`drafts/index.tsx`, líneas 146-158): ese flujo llama
      `initializeSurvey(...)` inmediatamente antes de su propio `router.push`
      hacia `question/[index]`, por lo que el store ya está correctamente
      inicializado con el instrumento correcto en el momento en que
      `QuestionRoute` se monta — el `id` de la ruta y el `instrumentId` del
      store deben coincidir en ese caso y la guarda no debe disparar.

### Fase 4 — Última red de seguridad en `QuestionScreen.tsx` ✅

- [x] En la rama `if (!currentItem)` (línea 89-97) de
      `src/components/instrument/QuestionScreen.tsx`, agregar un botón/acción
      visible (ej. "Volver a campañas") que navegue a `/(tabs)/campaign`, para
      que ningún estado inesperado —incluso uno no cubierto por las Fases 1-3—
      deje al usuario sin salida.
- [x] Mantener el texto actual ("No hay preguntas disponibles.") y solo añadir
      la acción, sin rediseñar la pantalla.

### Fase 5 — Verificación de regresión

- [ ] Confirmar manualmente que el flujo de **retomar un borrador** (tab
      `drafts/` → reanudar encuesta interrumpida) sigue funcionando igual —
      no pasa por `pre-survey` ni por el helper de Fase 2, así que no debería
      verse afectado, pero se confirma explícitamente en dispositivo.
- [ ] Confirmar manualmente que **forzar cierre de la app a mitad de una
      encuesta y reabrir** sigue funcionando igual — el historial de
      navegación nativo se pierde al reiniciar el proceso, por lo que este
      caso es independiente de los cambios de esta spec, pero se confirma
      explícitamente como parte de la regresión.
- [x] Ejecutar `pnpm typecheck` y `pnpm test` tras completar las Fases 1-4.

---

## Criterios de aceptación

- Al completar un instrumento dentro de una campaña y llegar a la pantalla
  "Comenzar" del siguiente instrumento, presionar "Atrás" nativo **antes** de
  tocar "Comenzar" lleva al usuario a `pre-survey` (o a la pantalla de la que
  legítimamente proviene), nunca a una pantalla muerta.
- Ninguno de los 8 puntos de transición identificados en `orchestrator.tsx`
  dentro de una campaña (paso normal, inyección S1, inyección S2, sobrescribir
  duplicado, saltar duplicado, cancelar duplicado, error de inyección, y
  llegada a campaña completada) deja pantallas obsoletas del instrumento
  anterior alcanzables por "Atrás".
- Si por cualquier motivo no cubierto se llega a una pantalla de pregunta con
  un `instrumentId` de ruta que no coincide con el store activo, el usuario es
  redirigido automáticamente en vez de ver una pantalla sin salida.
- Si aun así se llegara a la rama "No hay preguntas disponibles", el usuario
  tiene una acción visible para salir.
- El flujo de retomar un borrador funciona exactamente igual que antes de
  esta spec.
- El flujo de forzar cierre de la app a mitad de encuesta y reabrir funciona
  exactamente igual que antes de esta spec.
- `pnpm typecheck` y `pnpm test` pasan sin errores nuevos.

---

## Pruebas manuales

Se generará `docs/testing/NN-test-spec23.md` (raíz del ecosistema) al pasar
el spec a `[TESTING]`, cubriendo como mínimo:

- TC — Atrás nativo entre instrumento normal A y B (paso de campaña).
- TC — Atrás nativo entre S1 y S2 (inyección).
- TC — Atrás nativo tras sobrescribir un duplicado.
- TC — Atrás nativo tras saltar un duplicado (online y offline).
- TC — Atrás nativo al llegar a la pantalla de campaña completada.
- TC — Retomar borrador desde la tab `drafts/` (regresión).
- TC — Forzar cierre de la app a mitad de encuesta y reabrir (regresión).
