# ADR 0004 — Proyectos independientes (sin monorepo)

## Estado
Aceptado

## Contexto

El proyecto SOSAgro tiene tres componentes: `backend/` (NestJS), `frontend/` (Next.js) y `mobile/` (Expo). Se evaluó usar un monorepo (pnpm workspaces o Turborepo) para compartir tipos y lógica pura entre `frontend/` y `mobile/`.

## Decisión

`mobile/` es un proyecto Expo **autónomo**, sin relación de workspace con `frontend/` ni con `backend/`. Cada proyecto gestiona sus propias dependencias con su propio `package.json`.

Los tipos del dominio (`Instrument`, `Section`, `Question`, `Response`, `CampaignRender`, etc.) y la lógica pura (`buildResponsesPayload`, `isAnswerComplete`, `flattenSections`, `isQuestionVisible`) están **duplicados** en `mobile/src/types/` y `mobile/src/lib/`.

## Razones

1. **Complejidad operativa.** Un monorepo con Expo requiere configuración no trivial de Metro bundler para resolver paquetes fuera del directorio del proyecto. Esta configuración es frágil y varía entre versiones de Expo.

2. **Ciclos de vida independientes.** El frontend web y la app móvil tienen cadencias de release distintas. Acoplarlos en un workspace crea dependencias de deploy innecesarias.

3. **Herramientas distintas.** El frontend usa Next.js (webpack/turbopack); la app usa Metro. Compartir código entre bundlers distintos introduce edge cases de resolución de módulos.

4. **Scope acotado.** La lógica compartida es pequeña: 4 funciones puras y un conjunto de interfaces TypeScript. El costo de duplicación es bajo comparado con la complejidad del monorepo.

## Consecuencias

- Cuando un tipo cambia en el backend, debe actualizarse en `frontend/src/` y en `mobile/src/types/` por separado.
- La sincronización entre copias es **responsabilidad manual del equipo**. Se recomienda comentar en el PR cualquier cambio de tipo que afecte a ambos proyectos.
- No hay riesgo de que una actualización de dependencias en el frontend rompa la app mobile o viceversa.
