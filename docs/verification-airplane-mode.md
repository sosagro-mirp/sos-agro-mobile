# Verificación de modo avión — Fase 5.4

Checklist de escenarios a ejecutar manualmente antes de cada release.
Dispositivo recomendado: Android físico (API 30+). No Expo Go para escenarios de background sync.

---

## HV-01 — Flujo completo: campaña online → offline → sync

**Precondición:** Al menos una campaña activa descargada ("✓ Disponible sin conexión").

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Abrir app con red. Ir a Campañas. | Lista muestra campaña con badge verde. |
| 2 | Entrar a la campaña → completar pre-encuesta. | Navega al orquestador. |
| 3 | **Apagar red** (modo avión). | Banner "Sin conexión" aparece. |
| 4 | Iniciar instrumento → responder todas las preguntas. | Preguntas se guardan sin errores. |
| 5 | Ir a Revisión → tocar "Enviar encuesta". | Navega a "Encuesta completada". Mensaje: "Las respuestas se enviarán al servidor cuando haya conexión." |
| 6 | Tocar "Siguiente paso". | Orquestador muestra "Sin conexión / El paso anterior ya fue guardado". |
| 7 | **Encender red**. | Orquestador detecta red y reintenta automáticamente. Navega al siguiente paso. |
| 8 | Ir a Inicio → Sincronización. | Pendientes = 0. "Última sync" muestra hora reciente. |

**Verificar en backend:** `GET /api/surveys/:id` → `status: "synced"`.

---

## HV-02 — Restauración de borrador en la pregunta exacta

**Precondición:** Instrumento con al menos 5 preguntas disponible en caché.

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Iniciar instrumento. Responder preguntas 1–3. | Respuestas guardadas (debounce 250ms). |
| 2 | **Cerrar la app completamente** (swipe-kill). | — |
| 3 | Reabrir app. Ir a Inicio → Borradores. | El borrador aparece con "3 respuestas guardadas". |
| 4 | Tocar el borrador. | App carga estado y navega a **pregunta 4** (primera sin responder). |
| 5 | Verificar que las preguntas 1–3 ya tienen respuestas cargadas. | Las respuestas previas están visibles. |
| 6 | Retroceder a pregunta 1. | Muestra la respuesta guardada originalmente. |

**Caso borde:** Si las preguntas 1–N están todas respondidas, navega a la pantalla de Revisión.

---

## HV-03 — Múltiples sesiones offline sin duplicados

**Precondición:** 3 campañas distintas descargadas.

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | **Apagar red**. | — |
| 2 | Iniciar campaña 1 → completar todos los pasos disponibles hasta que el orquestador quede bloqueado. | Pasos encolados. |
| 3 | Repetir con campañas 2 y 3. | Cola muestra N entradas. |
| 4 | Ir a Sincronización. | Pendientes = N. |
| 5 | **Encender red**. | Sync se dispara automáticamente. |
| 6 | Observar que las entradas se envían en orden FIFO (una a la vez). | Spinner en la card de estado. Pendientes decrementa de N a 0. |
| 7 | Verificar en backend que no hay `surveyId` duplicados. | `GET /api/surveys?limit=50` — cada `surveyId` aparece exactamente una vez. |

---

## HV-04 — Reintento con backoff ante error 500

**Precondición:** Servidor backend configurado para devolver 500 en `POST /api/responses/batch` (mock o proxy).

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Completar encuesta con red. | Encuesta encolada. |
| 2 | Tocar "Sincronizar ahora" en pantalla de Sync. | Primer intento falla. Reintenta tras ~1s. |
| 3 | Observar reintentos sucesivos. | Cada intento espera el doble: 1s, 2s, 4s, 8s…, máximo 60s. |
| 4 | Tras 5 fallos consecutivos de red, la cola se detiene. | Pantalla de Sync muestra Pendientes > 0 pero no hay actividad. |
| 5 | Restaurar backend. Tocar "Sincronizar ahora". | `resetNetworkFailures()` y la cola procesa exitosamente. |

---

## HV-05 — Error 400 → failed_validation, sin reintento automático

**Precondición:** Servidor backend configurado para devolver 400 en `POST /api/responses/batch`.

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Completar encuesta con red. | Encuesta encolada. |
| 2 | Tocar "Sincronizar ahora". | El servicio intenta enviar. Servidor responde 400. |
| 3 | El entry pasa a `failed_validation`. **No hay reintentos automáticos.** | Pendientes = 0. "Con error" = 1. |
| 4 | La sección "Errores de validación" muestra el `errorDetail` del servidor. | Mensaje de error visible con detalle. |
| 5 | Restaurar backend. Tocar "Reintentar" en la entrada fallida. | `resetToRetry()` + nuevo intento. Envío exitoso. "Con error" = 0. |

---

## HV-06 — Cold start con cola pendiente

| Paso | Acción | Resultado esperado |
|------|--------|--------------------|
| 1 | Completar encuesta offline. Cola = 1 pending. | — |
| 2 | **Cerrar la app completamente**. | — |
| 3 | Reabrir con red disponible. | Al iniciar, `resetInFlightToRetry()` limpia huérfanos. `checkAndSync()` dispara sync automáticamente. |
| 4 | Ir a Sincronización. | Pendientes = 0. Última sync muestra hora de inicio de app. |

---

## Notas de ejecución

- Para forzar errores HTTP sin modificar el backend real, usar [mitmproxy](https://mitmproxy.org/) o configurar un proxy en el dispositivo.
- Para medir el backoff real, activar logs de `SyncQueueService` con `console.log` temporal o ir a `app/dev/logs.tsx` cuando esté disponible (Fase 6.2).
- Los escenarios HV-04 y HV-05 requieren un dispositivo físico o emulador con acceso al backend; no funcionan con Expo Go + API local si el dispositivo no está en la misma red.
