# Test 01 — Pruebas Manuales: Flujos Principales de la App Mobile

**Rama:** `development`  
**Plataforma objetivo:** iOS / Android (Expo Go o build de desarrollo)  
**Prerrequisitos generales:**
- Backend corriendo en `http://localhost:3000` (o apuntar a producción via `EXPO_PUBLIC_API_BASE_URL`)
- Al menos una campaña activa con instrumentos configurados en la base de datos
- Un usuario registrado con credenciales válidas

---

## TC-01 — Login exitoso

**Flujo:** Autenticación con credenciales válidas

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Abrir la app por primera vez (sin sesión activa) | Redirige automáticamente a `/login` |
| 2 | Observar el formulario de login | Se ven los campos "Correo electrónico" y "Contraseña", y el botón "Iniciar sesión" |
| 3 | Ingresar un correo válido con mayúsculas (ej. `ADMIN@example.com`) | El campo acepta el texto |
| 4 | Ingresar la contraseña correcta | El texto aparece oculto con asteriscos |
| 5 | Tocar el ícono/botón "Ver" junto al campo de contraseña | El texto de la contraseña se vuelve visible |
| 6 | Tocar "Ocultar" | El texto vuelve a estar oculto |
| 7 | Tocar "Iniciar sesión" | Aparece indicador de carga; luego redirige a la pestaña Campañas |
| 8 | Verificar el encabezado superior | Muestra el nombre del usuario autenticado y el indicador de conexión |

**Notas:**
- El correo se normaliza a minúsculas antes del envío (verificar con un correo en mayúsculas que exista en el backend).
- El token se guarda en `SecureStorage` y persiste entre sesiones.

---

## TC-02 — Login con credenciales incorrectas

**Flujo:** Validación de errores en el formulario de login

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ir a la pantalla de login | Formulario vacío visible |
| 2 | Dejar ambos campos vacíos y tocar "Iniciar sesión" | Los campos muestran indicadores de error / el botón no hace nada |
| 3 | Ingresar solo el correo y tocar "Iniciar sesión" | Validación indica que la contraseña es requerida |
| 4 | Ingresar correo válido y contraseña incorrecta, tocar "Iniciar sesión" | Aparece mensaje de error: "Correo o contraseña incorrectos" |
| 5 | Verificar que no hubo redirección | El usuario sigue en la pantalla de login |

---

## TC-03 — Restauración de sesión al relanzar la app

**Flujo:** Persistencia de sesión entre reinicios

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Iniciar sesión correctamente (ver TC-01) | Usuario autenticado en la app |
| 2 | Cerrar completamente la app (Force Quit) | — |
| 3 | Volver a abrir la app | La app no muestra la pantalla de login; redirige directamente a Campañas |
| 4 | Verificar el encabezado | El nombre del usuario aparece correctamente |

---

## TC-04 — Logout

**Flujo:** Cierre de sesión

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Estar autenticado en la app | — |
| 2 | Tocar el botón de logout en el encabezado | Aparece confirmación o cierra sesión directamente |
| 3 | Verificar la redirección | La app navega a la pantalla de login |
| 4 | Intentar navegar manualmente a `/campaign` | El guard redirige de vuelta a `/login` |

---

## TC-05 — Descarga de campañas activas (online)

**Flujo:** Obtener y cachear campañas desde el backend

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Estar autenticado y en la pestaña **Campañas** | Se muestra la lista de campañas (o estado vacío si no hay ninguna) |
| 2 | Tocar el botón "Actualizar" | Aparece el indicador de progreso de descarga |
| 3 | Observar las fases del progreso | Primero muestra "Descargando campañas", luego "Descargando instrumentos" |
| 4 | Esperar a que termine la descarga | Las campañas aparecen con el badge "✓ Sin conexión" |
| 5 | Verificar cada tarjeta de campaña | Muestra nombre, descripción (truncada a 2 líneas), número de pasos e instrumentos |

---

## TC-06 — Modo offline: visualización de campañas cacheadas

**Flujo:** Uso de la app sin conexión a internet

**Prerrequisito:** Campañas previamente descargadas (TC-05 completado)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Activar modo avión en el dispositivo | — |
| 2 | Abrir la pestaña **Campañas** | Aparece banner naranja/rojo "Sin conexión" |
| 3 | Verificar las campañas descargadas | Las campañas con badge "✓ Sin conexión" siguen visibles |
| 4 | Tocar el botón "Actualizar" | El botón está deshabilitado (no se puede refrescar sin conexión) |
| 5 | Verificar el indicador de estado en el encabezado | Muestra "Sin conexión" en rojo |

---

## TC-07 — Iniciar una campaña: identificación del encuestado

**Flujo:** Pre-encuesta — selección/creación de agricultor

**Prerrequisito:** Al menos una campaña descargada

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Tocar una campaña en la lista | Navega a la pantalla "¿Quién es el encuestado?" |
| 2 | Verificar las opciones disponibles | Se ven: buscar agricultor, agricultor nuevo, continuar sin identificar |
| 3 | Tocar en el campo de búsqueda e ingresar parte del nombre del agricultor | Aparece indicador de carga; tras ~300ms muestra resultados |
| 4 | Seleccionar un resultado de la lista | El agricultor queda seleccionado; se habilita el botón continuar |
| 5 | Tocar "Continuar" | Navega al flujo de la campaña |

---

## TC-08 — Pre-encuesta: continuar con último agricultor

**Flujo:** Reúso del último encuestado sin búsqueda

**Prerrequisito:** Haber realizado al menos una encuesta previa con un agricultor identificado

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Tocar una campaña en la lista | Navega a la pantalla de pre-encuesta |
| 2 | Verificar que aparece el botón "Continuar con {nombre}" | El botón muestra el nombre del último agricultor registrado |
| 3 | Tocar ese botón | Se selecciona ese agricultor automáticamente |
| 4 | Tocar "Continuar" | Navega al flujo de la campaña |

---

## TC-09 — Pre-encuesta: continuar sin identificar encuestado

**Flujo:** Iniciar campaña sin asociar agricultor

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Tocar una campaña en la lista | Navega a la pantalla de pre-encuesta |
| 2 | Tocar el enlace "Continuar sin identificar encuestado" | Navega al flujo de campaña sin agricultor asociado |
| 3 | Completar el flujo de encuesta | La encuesta se guarda y sincroniza sin agricultor asociado |

---

## TC-10 — Flujo de preguntas: navegación y validación

**Flujo:** Responder preguntas de un instrumento paso a paso

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Iniciar un instrumento (desde campaña o desde la pantalla de inicio del instrumento) | Navega a la primera pregunta |
| 2 | Verificar el encabezado | Muestra nombre de la sección y contador "1 de N" |
| 3 | Verificar la barra de progreso | Está en el primer segmento |
| 4 | Intentar tocar "Siguiente" sin responder una pregunta requerida | El botón está deshabilitado (no avanza) |
| 5 | Responder la pregunta actual | El botón "Siguiente" se habilita |
| 6 | Tocar "Siguiente" | Navega a la siguiente pregunta; la barra de progreso avanza |
| 7 | Tocar "Anterior" en la segunda pregunta | Regresa a la primera pregunta con la respuesta conservada |
| 8 | En la primera pregunta, verificar el botón "Anterior" | El botón está deshabilitado o no visible |
| 9 | Llegar a la última pregunta | El botón dice "Finalizar" en lugar de "Siguiente" |
| 10 | Tocar "Finalizar" | Navega a la pantalla de revisión |

---

## TC-11 — Tipos de pregunta: open_text y numeric

**Flujo:** Validación de campos de texto libre y numérico

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Llegar a una pregunta de tipo `open_text` | Se muestra un campo de texto multilínea |
| 2 | Intentar avanzar sin ingresar texto (campo requerido) | El botón "Siguiente" permanece deshabilitado |
| 3 | Ingresar solo espacios en blanco | El botón sigue deshabilitado (se aplica `trim()`) |
| 4 | Ingresar texto válido | El botón se habilita |
| 5 | Llegar a una pregunta de tipo `numeric` | Se muestra teclado numérico decimal |
| 6 | Ingresar un número con decimales (ej. `3.5`) | El valor se acepta correctamente |
| 7 | Borrar el valor | El botón se deshabilita nuevamente |

---

## TC-12 — Tipos de pregunta: yes_no, single_choice, likert, compliance

**Flujo:** Selección de opciones de respuesta

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Llegar a una pregunta `yes_no` | Se muestran exactamente 2 opciones (radio buttons) |
| 2 | Seleccionar "Sí" | La opción queda marcada; el botón "Siguiente" se habilita |
| 3 | Seleccionar "No" | Cambia la selección; la primera se desmarca |
| 4 | Llegar a una pregunta `single_choice` | Lista de opciones con radio buttons |
| 5 | Seleccionar una opción | Muestra borde verde izquierdo y fondo verde claro |
| 6 | Llegar a una pregunta `likert` con ≤7 opciones | Se muestran botones circulares con etiquetas en los extremos |
| 7 | Llegar a una pregunta `compliance` | Las opciones tienen colores: verde, naranja, rojo (según índice) |
| 8 | Seleccionar cada tipo | La selección se refleja visualmente y habilita el avance |

---

## TC-13 — Tipo de pregunta: multiple_choice con opción "Otro"

**Flujo:** Selección múltiple con texto libre adicional

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Llegar a una pregunta `multiple_choice` | Lista de opciones con checkboxes |
| 2 | Seleccionar dos o más opciones | El botón se habilita |
| 3 | Deseleccionar todas las opciones en una pregunta requerida | El botón se deshabilita |
| 4 | Si existe una opción "Otro", seleccionarla | Aparece un campo de texto adicional |
| 5 | Intentar avanzar sin llenar el campo "Otro" | El botón permanece deshabilitado |
| 6 | Llenar el campo y avanzar | La respuesta guarda los optionIds y el texto del "Otro" |

---

## TC-14 — Preguntas condicionales (visibilidad)

**Flujo:** Una pregunta solo aparece si se cumple una condición en respuesta previa

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Responder una pregunta `yes_no` con "No" | La pregunta condicional dependiente de "Sí" no aparece en el flujo |
| 2 | Regresar y cambiar la respuesta a "Sí" | La pregunta condicional ahora aparece en el flujo |
| 3 | Completar la pregunta condicional y avanzar | El flujo incluye esa pregunta en la revisión final |

*Nota: Requiere un instrumento configurado con lógica condicional en el backend.*

---

## TC-15 — Auto-guardado de borradores

**Flujo:** Las respuestas se persisten localmente en SQLite

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Iniciar una encuesta y responder 3 preguntas | Las respuestas se guardan automáticamente |
| 2 | Forzar el cierre de la app (Force Quit) | — |
| 3 | Reabrir la app y navegar a la pestaña **Borradores** | Aparece el borrador con el conteo correcto de respuestas guardadas |
| 4 | Tocar "Continuar →" en el borrador | Reanuda la encuesta en la primera pregunta sin respuesta |
| 5 | Verificar que las respuestas anteriores siguen guardadas | Al regresar a preguntas anteriores, las respuestas persisten |

---

## TC-16 — Pantalla de revisión y envío

**Flujo:** Revisar respuestas antes de enviar

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Llegar a la pantalla de revisión (después de la última pregunta) | Muestra el nombre del instrumento y el contador "X de Y preguntas respondidas" |
| 2 | Verificar la lista de preguntas | Cada pregunta muestra su respuesta formateada |
| 3 | Tocar una pregunta respondida | Navega de vuelta a esa pregunta para editarla |
| 4 | Editar la respuesta y volver a la revisión | La revisión refleja el cambio |
| 5 | Verificar si hay preguntas requeridas sin responder | Tienen el badge rojo "Requerida" |
| 6 | Tocar "Enviar encuesta" | Muestra indicador de carga; luego navega a pantalla de éxito |

---

## TC-17 — Pantalla de encuesta completada

**Flujo:** Confirmación de envío y continuación

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Enviar una encuesta exitosamente | Aparece pantalla con ícono verde de ✓ |
| 2 | Verificar el mensaje | Dice "Encuesta completada" + nombre del instrumento |
| 3 | Verificar el mensaje de sincronización | "Las respuestas se enviarán al servidor cuando haya conexión." |
| 4 | Si es parte de una campaña: tocar "Siguiente paso" | Regresa al orquestador para continuar con el siguiente instrumento |
| 5 | Si es encuesta independiente: tocar "Volver al inicio" | Regresa a la pestaña de Campañas |

---

## TC-18 — Sincronización: envío online

**Flujo:** Sincronizar encuestas completadas con el servidor

**Prerrequisito:** Al menos una encuesta completada (puede estar offline)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Navegar a la pestaña **Sincronización** | Muestra el estado actual y los contadores |
| 2 | Verificar el contador "Pendientes" | Muestra el número de encuestas por sincronizar |
| 3 | Estar conectado a internet | El indicador muestra "En línea" en verde |
| 4 | Tocar "Sincronizar ahora" | Aparece spinner "Enviando encuesta…" |
| 5 | Esperar a que termine | El contador "Pendientes" llega a 0; muestra "Última sync: HH:MM" |
| 6 | Verificar en el backend (o base de datos) | `POST /api/responses/batch` fue llamado; `PATCH /api/surveys/{id}/sync` marcó el survey |

---

## TC-19 — Sincronización: comportamiento offline y auto-sync

**Flujo:** La app encola y reintenta cuando vuelve la conexión

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Activar modo avión | El indicador cambia a "Sin conexión" en rojo |
| 2 | Completar y "enviar" una encuesta | La encuesta se encola; aparece en "Pendientes" |
| 3 | Tocar "Sincronizar ahora" | El botón está deshabilitado (sin conexión) |
| 4 | Desactivar modo avión | El indicador vuelve a verde |
| 5 | Esperar o tocar "Sincronizar ahora" | La app detecta la conexión y lanza la sincronización automáticamente |
| 6 | Verificar que el contador baja a 0 | Sincronización completada |

---

## TC-20 — Sincronización: errores de validación del servidor

**Flujo:** El backend rechaza una encuesta con error de validación

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Tener una encuesta en la cola de sync que el servidor va a rechazar (ej. instrumento desactivado) | — |
| 2 | Intentar sincronizar | El contador "Con error" aumenta; aparece la sección de "Entradas fallidas" |
| 3 | Verificar la tarjeta de error | Muestra: ID del survey, mensaje de error del servidor, número de intentos |
| 4 | Tocar "Reintentar" | La encuesta vuelve a la cola; se intenta sincronizar nuevamente |
| 5 | Si el error persiste | La tarjeta vuelve a aparecer con el conteo de intentos incrementado |

---

## TC-21 — Limpiar historial de sincronizaciones

**Flujo:** Purgar registros sincronizdos antiguos

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ir a la pestaña **Sincronización** | — |
| 2 | Tocar "Limpiar historial sincronizado" | Ejecuta la limpieza de registros sincronizados hace más de 30 días |
| 3 | Verificar el mensaje de feedback | "X registros eliminados" o "No hay registros para limpiar" |

---

## TC-22 — Flujo completo de campaña (happy path)

**Flujo:** De inicio a fin en una campaña con múltiples pasos

**Prerrequisito:** Campaña configurada con al menos 2 instrumentos en pasos secuenciales

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Descargar la campaña (TC-05) | Campaña cacheada |
| 2 | Tocar la campaña | Pre-encuesta |
| 3 | Seleccionar un agricultor o continuar sin identificar | — |
| 4 | En el instrumento de inicio: verificar "Paso 1 de N" | Badge visible |
| 5 | Tocar "Comenzar" | Primera pregunta del instrumento |
| 6 | Responder todas las preguntas | Llegar a revisión |
| 7 | Enviar encuesta del paso 1 | Pantalla de "Encuesta completada" con "Paso 1 de N" |
| 8 | Tocar "Siguiente paso" | El orquestador carga el Paso 2 automáticamente |
| 9 | Repetir para cada paso hasta el último | — |
| 10 | Completar el último paso | Navega a pantalla "Visita completada" con nombre de campaña |
| 11 | Tocar "Volver al inicio" | Regresa a la lista de campañas; el store de sesión se reinicia |

---

## TC-23 — Easter egg: pantalla de logs de desarrollo

**Flujo:** Acceso a la pantalla de logs internos

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Estar en cualquier pantalla con el encabezado visible | — |
| 2 | Tocar el texto "SOS Agro 4C" en el encabezado exactamente 5 veces rápidamente | Navega a la pantalla `/dev/logs` |
| 3 | Verificar el contenido | Muestra logs internos de la sesión |

---

## Notas para el tester

- **Pruebas offline:** Usar la función de "Modo Avión" del dispositivo, no solo desconectar WiFi (para asegurar que se corta también la red celular).
- **Limpiar estado entre pruebas:** Desinstalar y reinstalar la app limpia el `SecureStorage` y la base de datos SQLite.
- **Verificar el backend:** Para pruebas que implican sincronización, consultar la base de datos directamente:
  ```bash
  docker exec my-database psql -U santiagoSuarez219 -d sos-agro -c "SELECT * FROM survey ORDER BY created_at DESC LIMIT 5;"
  ```
- **Logs del dispositivo:** Usar `pnpm start` + Expo DevTools o `adb logcat` (Android) para ver logs en tiempo real durante las pruebas.
