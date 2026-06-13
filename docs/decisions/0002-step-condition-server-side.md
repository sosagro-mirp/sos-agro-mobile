# ADR 0002 — Evaluación de condiciones de pasos en el servidor

## Estado
Aceptado

## Contexto

La entidad `StepCondition` del backend soporta `conditionType: 'question' | 'crop'` y `logicalOperator: 'AND' | 'OR'`. Determinar qué paso sigue en una sesión de campaña requiere evaluar estas condiciones contra las respuestas y los datos del agricultor.

Existe la opción de reimplementar esta lógica en el cliente (app) para permitir avance entre pasos sin conexión.

## Decisión

La evaluación de condiciones se **delega completamente al backend** mediante `GET /api/campaign-sessions/:id/next-step`. La app nunca reimplementa la lógica de `StepCondition`.

## Consecuencias

**Positivas:**
- Una única fuente de verdad para la lógica de condiciones. Si cambia la lógica en el backend, la app no necesita actualización.
- Sin riesgo de divergencia entre la evaluación del cliente y la del servidor.
- Menor superficie de código en la app.

**Negativas:**
- El avance entre pasos requiere conectividad o un caché del `nextStep` precalculado.
- Si la red se pierde justo entre pasos, el encuestador queda bloqueado hasta recuperarla.

## Mitigación

El resultado de `getNextStep` puede cachearse localmente al recibirlo para permitir avanzar sin red inmediata. Esto no requiere reimplementar la lógica, solo guardar la respuesta ya calculada por el servidor.
