# [DONE] Spec 24 — Overflow de texto y escalado de fuente del sistema

**Fecha de redacción:** 2026-07-27
**Repositorio afectado:** `mobile/` (únicamente)
**Prioridad:** Media — defecto visual, no bloquea la recolección de datos
**Origen:** `specs/backlog.md`, ítem 5 — reportado por el usuario probando la
APK en un Samsung Galaxy S25 durante el piloto multidispositivo
(`docs/testing/17-test-piloto-multidispositivo.md`)

---

## Contexto

Probando la APK en un Samsung Galaxy S25 se observó que los textos
**"En línea" / "Sin conexión"** (píldora de estado del header de tabs) y
**"Actualizar"** (botón del header de Campañas) se ven **cortados**.

### Causa raíz (por lectura de código)

No es un bug puntual de dos pantallas: es la **ausencia total de manejo de
overflow de texto en el proyecto**. Verificado por búsqueda sobre todo
`src/` y `app/`: no se usa `flexShrink`, `flexWrap`, `numberOfLines`,
`adjustsFontSizeToFit` ni `maxFontSizeMultiplier` en ningún punto del código.

Sin `maxFontSizeMultiplier`, React Native aplica el multiplicador de fuente del
sistema **sin techo**. El ajuste "Tamaño de fuente" de One UI (Samsung) llega a
multiplicadores altos, y el problema se manifiesta primero en los elementos con
menos holgura horizontal:

- **"En línea" / "Sin conexión"** — `app/(tabs)/_layout.tsx:44`, dentro de
  `statusPill` (estilos en líneas 143-163: `paddingHorizontal: 10`,
  `paddingVertical: 5`, `fontSize: 12`). Vive en `headerRight` (líneas 138-142,
  `flexDirection: 'row'`, `gap: 12`) junto al botón "Salir", y `headerRight` es
  hijo de `header` (líneas 120-126) con `justifyContent: 'space-between'`.
  **Ningún hijo tiene `flexShrink`** — y el default de Yoga en React Native es
  `flexShrink: 0`, es decir, los hijos no se encogen. Cuando el ancho requerido
  excede el disponible, el extremo derecho se sale de pantalla.
  Agrava el caso que `"Sin conexión"` es más largo que `"En línea"`: el corte
  aparece justo en el estado offline, que es el estado normal de trabajo en campo.
- **"Actualizar"** — `app/(tabs)/campaign/index.tsx:64`, mismo patrón: fila
  `header` (líneas 207-216) con `justifyContent: 'space-between'` entre el
  título "Campañas" (`fontSize: 17`) y el botón (`fontSize: 15`), sin
  protección de encogimiento en ninguno de los dos.

El nombre de usuario (`userName`, `_layout.tsx:38`) comparte el riesgo: es un
dato de longitud variable en el lado izquierdo de la misma fila, y un nombre
largo empuja `headerRight` fuera de la pantalla incluso sin escalado de fuente.

### Estado pendiente de confirmar

El diagnóstico es por lectura de código. **Falta confirmar en el dispositivo el
porcentaje exacto de escala de fuente que lo reproduce** (One UI → Ajustes →
Pantalla → Tamaño y estilo de fuente). Esa medición es el caso `TC-024-01` de la
ronda manual y define el techo que se elige en la Fase 1.

---

## Alcance

### Incluye

- Un componente `AppText` propio que envuelve `Text` de React Native con un
  techo de escalado sensato por defecto, para que el problema no se repita en
  cada pantalla nueva.
- Adopción de `AppText` en los puntos de layout ajustado ya identificados:
  header de tabs (`_layout.tsx`) y header de Campañas (`campaign/index.tsx`).
- Protección de encogimiento (`flexShrink` / `numberOfLines`) en esas dos filas.
- Confirmación del umbral real de escala de fuente en el dispositivo del piloto.

### No incluye

- **Migración de todos los `Text` del proyecto a `AppText`.** Se adoptan solo
  los puntos con overflow confirmado o de alto riesgo (headers y píldoras). Los
  textos de contenido —enunciados de preguntas, opciones de respuesta,
  descripciones— **deben seguir escalando libremente**: cap­ar su tamaño
  perjudicaría la accesibilidad de encuestadores con baja visión, que es
  justamente para lo que existe el ajuste del sistema. La migración global, si
  se quiere, es otro spec con criterio caso por caso.
- Rediseño del header ni cambios de jerarquía visual, tipografía o paleta.
- Soporte de orientación horizontal (no está habilitada en la app).
- Truncado del nombre de campaña ni de otros textos de las tarjetas de lista:
  no se reportó corte ahí y tienen ancho completo disponible.

---

## Impacto en el sistema

| Archivo | Cambio |
|---|---|
| `src/components/common/AppText.tsx` | **Nuevo** — wrapper de `Text` con `maxFontSizeMultiplier` por defecto |
| `app/(tabs)/_layout.tsx` | `AppText` + `flexShrink`/`numberOfLines` en `statusText`, `userName` y `headerRight` |
| `app/(tabs)/campaign/index.tsx` | `AppText` + `flexShrink`/`numberOfLines` en `title` y `refreshBtn` |
| `src/__tests__/e2e-024-textOverflow.test.ts` | **Nuevo** — pruebas del wrapper |

Sin cambios en `schema.ts`, en la cola de sync ni en el flujo offline.
**No requiere migración Drizzle.** No agrega dependencias: `maxFontSizeMultiplier`
y `numberOfLines` son props nativas de `Text` en React Native 0.81.

> `src/components/common/` ya existe (`PrimaryButton`, `SecondaryButton`,
> `Screen`), así que `AppText` sigue la ubicación y convención vigentes.

---

## Decisión de diseño — wrapper en vez de parche por caso

Se podría arreglar solo las dos pantallas reportadas con `numberOfLines={1}` y
`flexShrink: 1`. Se elige el wrapper porque:

1. El backlog ya identifica esto como una **falta transversal**, no como dos
   bugs; sin un default del proyecto, la siguiente pantalla con un header
   ajustado reintroduce el defecto.
2. `flexShrink` solo por sí mismo no arregla el escalado: encoge la caja, pero
   el texto se corta igual si el multiplicador del sistema es alto. Se necesitan
   las dos cosas.
3. Un wrapper permite fijar el techo en **un solo lugar** y ajustarlo cuando
   se confirme el multiplicador real del dispositivo, sin volver a tocar
   pantallas.

Valor inicial propuesto: `maxFontSizeMultiplier = 1.3` para los textos de
layout ajustado. Es un punto de partida, no un dato medido — `TC-024-01` lo
confirma o lo corrige antes de cerrar la Fase 1.

---

## Evaluación MCP

**¿Aplica MCP?** No. Es un ajuste de presentación en el cliente móvil; no
expone datos ni acciones a un agente, y no toca el MCP `sosagro-admin`.

---

## Fases de implementación

### Fase 1 — Medición en dispositivo ⚠️ No ejecutada por Claude

- [ ] Ejecutar `TC-024-01` de `docs/testing/22-test-spec24.md`: identificar el
      porcentaje de escala de fuente de One UI a partir del cual "Sin conexión"
      y "Actualizar" se cortan en el Galaxy S25, y con qué ancho de pantalla.
- [ ] Registrar el hallazgo en el archivo de test y fijar el valor definitivo de
      `maxFontSizeMultiplier` a partir de esa medición.

> **Nota:** Claude no tiene acceso al dispositivo físico del piloto, así que
> esta fase queda pendiente para el usuario. Las Fases 2-4 se implementaron
> igualmente usando el valor propuesto en la sección "Decisión de diseño"
> (`MAX_FONT_SCALE = 1.3`) como punto de partida documentado — no como dato
> medido. `TC-024-01` sigue pendiente en la ronda manual y puede corregir este
> valor antes de marcar el spec como `[DONE]`.

### Fase 2 — Componente `AppText` ✅ Completada (2026-07-27, con la salvedad de arriba)

- [x] Crear `src/components/common/AppText.tsx` con tres exports nombrados:
      - `MAX_FONT_SCALE` — el techo de escalado (`1.3`, valor propuesto sin
        confirmar en dispositivo — ver Fase 1).
      - `resolveAppTextProps(props: TextProps): TextProps` — **función pura**
        que devuelve las props a aplicar: reenvía todo tal cual y agrega
        `maxFontSizeMultiplier: MAX_FONT_SCALE` **solo si el call-site no lo
        pasó**. No agrega ninguna otra prop.
      - `AppText` — el componente, que se limita a `<Text {...resolveAppTextProps(props)} />`.
- [x] Usa `TextProps` sin recortar el tipo, para que `numberOfLines`, `style`,
      `accessibilityRole` y `onPress` sigan funcionando en los call-sites.
- [x] Verificar que `e2e-024-textOverflow.test.ts` pasa a verde.

**Resultado:** 7/7 casos en verde.

> **Por qué la lógica va en una función pura y no dentro del componente:**
> el repositorio **no tiene `@testing-library/react-native` ni
> `react-test-renderer`** instalados, y este spec no agrega dependencias
> (instalar una requiere aprobación aparte y afecta el build de EAS). Sacando la
> resolución de props a una función pura, el contrato del wrapper queda cubierto
> por Jest sin renderizar; lo visual se valida en la ronda manual, que es donde
> corresponde según `CLAUDE.md`.

### Fase 3 — Adopción en los puntos con overflow ✅ Completada (2026-07-27)

- [x] `app/(tabs)/_layout.tsx`:
      - `statusText` y `userName` → `AppText` con `numberOfLines={1}`;
      - **Ajuste respecto al plan original:** en vez de `flexShrink: 1` en
        *ambos* `statusPill` y el contenedor izquierdo (que solo garantiza que
        el username ceda "primero" de forma proporcional, no que la píldora
        quede intacta), se implementó `headerRight` completo
        (`statusPill` + botón "Salir") con `flexShrink: 0` — **tamaño fijo,
        nunca se encoge** — y el nuevo contenedor `headerLeft` (el `Pressable`
        que envuelve `appName`+`userName`) con `flexShrink: 1`. Esto cumple el
        criterio 4 de forma determinística: la píldora y "Salir" quedan
        garantizados como completamente visibles en cualquier escenario,
        porque físicamente no pueden encogerse — no dependen de que el
        username "ceda antes" en una repartición proporcional.
- [x] `app/(tabs)/campaign/index.tsx`:
      - `title` y `refreshBtn` → `AppText` con `numberOfLines={1}`;
      - `flexShrink: 1` en `title`; el botón "Actualizar" se envolvió en un
        `Pressable` con `flexShrink: 0` (`refreshBtnWrapper`) para el mismo
        tratamiento de tamaño fijo que en `_layout.tsx`.
- [x] El `dot` de la píldora conserva su tamaño fijo — garantizado
      transitivamente porque `headerRight` (su ancestro) ya no se encoge.

**Resultado:** `pnpm typecheck` limpio.

**Corrección post-`@reviewer` (2026-07-27):** la auditoría de mobile
(`docs/reports/auditorias/13-auditoria-mobile-spec49-spec24.md`, hallazgo
🟠-2) detectó que el botón **"Salir"** seguía siendo un `Text` plano sin
techo de escalado. Como `headerRight` es de tamaño fijo (`flexShrink: 0`,
para garantizar el criterio 4), un "Salir" sin capar podía crecer sin límite
y desbordar la fila por el borde derecho — exactamente lo que el criterio 4
prohíbe. Se corrigió aplicando `AppText` + `numberOfLines={1}` también a
`logoutText`, igual que ya tenían `statusText` y `userName`. `pnpm typecheck`
sigue limpio tras el cambio.

### Fase 4 — Verificación y cierre ✅ Completada (2026-07-27)

- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test`. Typecheck limpio; lint sin
      errores (los 3 warnings en archivos tocados son preexistentes, no
      introducidos por este spec — verificado con `git diff`); test 170/170 en
      verde (13/13 suites, incluyendo las de spec49 en la misma rama).
- [x] Marcar el spec como `[TESTING]`.
- [x] Ronda manual completa de `docs/testing/22-test-spec24.md` — **6/6
      aprobados** (2026-07-28), sobre Expo Go (ver corrección del requisito de
      dispositivo en el propio archivo de test). `TC-024-01` se adaptó: sin
      build anterior al fix disponible, se validó que `MAX_FONT_SCALE = 1.3`
      aguanta la escala máxima del sistema en vez de medir el umbral original.
- [x] Invocar `@reviewer` antes del merge a `development` — ✅ APROBADO para
      el código de este spec (ver
      `docs/reports/auditorias/13-auditoria-mobile-spec49-spec24.md`). El
      bloqueo que reportó (ronda manual 0/6) ya se resolvió arriba. El
      hallazgo 🟠-2 (botón "Salir" sin techo de escalado) se corrigió en la
      misma rama y quedó validado en `TC-024-04`.
- [ ] Marcar `[DONE]` y cerrar el ítem 5 de `specs/backlog.md`.

---

## Criterios de aceptación

1. Con la escala de fuente del sistema en el valor que reproduce el defecto
   (medido en `TC-024-01`), el texto **"Sin conexión"** se lee completo en el
   header de tabs, sin corte ni desborde de pantalla.
2. En las mismas condiciones, el botón **"Actualizar"** del header de Campañas
   se lee completo.
3. Con la escala de fuente por defecto del sistema, ambos headers se ven
   **exactamente igual que antes del cambio** (sin regresión visual).
4. Con un nombre de usuario largo (≥ 30 caracteres) y escala de fuente
   aumentada, la píldora de estado y el botón "Salir" siguen completamente
   visibles; el nombre de usuario es lo que se trunca con elipsis.
5. `AppText` aplica el techo de escalado por defecto, y un
   `maxFontSizeMultiplier` pasado explícitamente en el call-site lo
   sobreescribe.
6. `AppText` reenvía el resto de props de `Text` sin alterarlas
   (`numberOfLines`, `style`, `onPress`, props de accesibilidad).
7. Los textos de contenido de las encuestas (enunciados de preguntas y opciones
   de respuesta) **siguen escalando sin techo** con el ajuste del sistema.

---

## Pruebas asociadas

> Estos archivos se crean junto con el spec y arrancan **en rojo**.

- **Manuales:** `docs/testing/22-test-spec24.md` — casos `TC-024-01` a
  `TC-024-06`. Requieren dispositivo físico con el ajuste de tamaño de fuente
  del sistema; sin casos `TC-MCP-` (no aplica MCP).
- **Automáticas:** `src/__tests__/e2e-024-textOverflow.test.ts` — criterios 5 y
  6 (contrato del wrapper `AppText`).

Los criterios 1, 2, 3, 4 y 7 son inherentemente visuales y dependen del ajuste
de fuente del sistema operativo: se validan en la ronda manual sobre el
dispositivo, no en Jest.

### Estado rojo verificado (2026-07-27)

`e2e-024-textOverflow.test.ts` no carga: `src/components/common/AppText.tsx` no
existe todavía. La suite completa (8 casos) pasa a verde con la Fase 2.

`tsconfig.json` excluye `src/__tests__/**`, así que la suite en rojo **no rompe
`pnpm typecheck`** — verificado: el typecheck de `mobile/` pasa hoy en limpio.

---

## Rama

| Repositorio | Rama planeada | Rama real de implementación |
|---|---|---|
| `mobile/` | `bug/spec24-text-overflow` | `bug/spec49-identidad-offline` |

> ⚠️ **Desviación respecto al plan:** el usuario pidió implementar este spec
> sobre la rama ya abierta del spec 49 en vez de crear una rama nueva, para no
> fragmentar el trabajo pendiente de merge. Ambos specs son independientes (no
> comparten archivos), así que no hay conflicto de contenido — solo quedan
> mezclados en el mismo PR/rama en lugar de en ramas separadas.

---

## Aprobación de implementación

> Claude no escribe código de implementación hasta que esta sección esté marcada.

- [x] Paquete (spec + pruebas) aprobado por el usuario
- **Fecha de aprobación:** 2026-07-27
