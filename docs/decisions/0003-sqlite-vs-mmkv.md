# ADR 0003 — SQLite (expo-sqlite + Drizzle) en lugar de MMKV

## Estado
Aceptado

## Contexto

El spec original especificaba MMKV (`react-native-mmkv`) como motor de persistencia local. MMKV es un key-value store síncrono escrito en C++ con cifrado nativo, ~30x más rápido que AsyncStorage para lecturas/escrituras simples.

Durante la implementación de la fase 3.2 se identificó que el volumen de encuestas offline hace al modelo key-value inadecuado.

## Decisión

Se usa **`expo-sqlite`** como motor de base de datos local con **Drizzle ORM** para queries type-safe y gestión de migraciones.

## Razones

1. **Volumen de datos estructurados.** Un encuestador puede acumular decenas de encuestas offline. Con MMKV, listar encuestas pendientes requiere cargar todas las claves en memoria para filtrar en JavaScript. SQLite resuelve esto con `WHERE status = 'pending'` sin presión de RAM.

2. **Compatibilidad con Expo Go.** `expo-sqlite` está incluido en el SDK de Expo y funciona en Expo Go sin `expo prebuild`. MMKV requiere código nativo compilado, lo que obliga a usar bare workflow desde el inicio del desarrollo.

3. **Migraciones de esquema seguras.** Drizzle Kit genera migraciones SQL que se aplican al arrancar la app. Actualizar el esquema en una versión futura no pierde datos locales del encuestador.

4. **Modelo mental familiar.** El equipo ya trabaja con PostgreSQL en el backend y el frontend usa Dexie (IndexedDB). SQLite es el equivalente mobile natural.

5. **Datos relacionales por naturaleza.** `surveys → responses`, `campaigns → sessions → surveys` son relaciones que una base de datos modela directamente; MMKV los aplanarías en JSON serializados.

## Trade-offs aceptados

- MMKV es más rápido para operaciones de lectura/escritura de un solo valor (config, JWT, flags). Para esos casos se sigue usando `expo-secure-store` (JWT) o `AsyncStorage` si fuera necesario.
- Las queries SQLite son asíncronas, a diferencia de la API síncrona de MMKV. El debounce de 250ms en `surveyDraftStore` absorbe la latencia.
