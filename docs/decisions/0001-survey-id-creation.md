# ADR 0001 — Estrategia de creación de IDs de encuesta

## Estado
Aceptado

## Contexto

Para crear una sesión de campaña en el servidor (`POST /api/campaign-sessions`) se necesita conexión en el momento de la llamada. Existe la alternativa de generar un ID local (UUID), permitir que el encuestador complete todo el flujo offline, y luego hacer un "remap" del ID local al ID real del servidor al sincronizar.

## Decisión

Se adopta la **estrategia conservadora**: bloquear el inicio de una sesión de campaña si no hay conexión al momento de hacer `POST /api/campaign-sessions`. La app muestra el mensaje:

> "Conéctate al menos una vez para iniciar esta visita."

Una vez creada la sesión en el servidor, la red puede cortarse y el llenado de respuestas continúa normalmente de forma offline.

## Consecuencias

**Positivas:**
- Sin lógica de remap de IDs locales → reales. El `SyncQueueService` siempre tiene un `campaignSessionId` real al enqueuar.
- Sin riesgo de crear sesiones huérfanas o duplicadas en el servidor.
- Menor complejidad de sincronización y menor superficie de bugs.

**Negativas:**
- El encuestador necesita al menos un momento de conectividad para iniciar cada visita.
- En zonas con conectividad muy esporádica, esto puede retrasar el inicio de la jornada.

## Revisión futura

Si el campo reporta que la restricción es un bloqueador operativo, la siguiente iteración implementará IDs locales con remap. El `SyncQueueService` ya tiene el campo `campaignLocalSessionId?` en el esquema de `syncQueue` para ese escenario.
