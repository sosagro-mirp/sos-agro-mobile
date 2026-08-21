# Test 03 — Pruebas Manuales: Captura de Polígonos GPS (Spec 29)

**Rama:** `feature/spec29-farm-plots`  
**Plataforma objetivo:** iOS / Android (build de desarrollo — Expo Go no soporta `expo-location` en todas las versiones)  
**Prerrequisitos:**
- Backend corriendo y accesible desde el dispositivo
- Al menos un agricultor registrado **con finca asociada** en la base de datos
- Al menos un agricultor registrado **sin finca** (para probar ese caso borde)
- Usuario con rol `pollster` o `admin` autenticado en la app
- Permisos de ubicación **no otorgados previamente** (para probar el flujo de solicitud)

---

## TC-01 — Verificar que el tab "Lotes" aparece en la barra de navegación

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Abrir la app e iniciar sesión | Se muestran los tabs: Campañas, Borradores, Sincronización |
| 2 | Observar la barra inferior de tabs | Aparece un cuarto tab llamado **"Lotes"** con ícono de mapa |
| 3 | Tocar el tab "Lotes" | Navega a la pantalla de búsqueda de agricultores |

---

## TC-02 — Búsqueda de agricultor con finca registrada

**Precondición:** Dispositivo con conexión a internet.

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ir al tab "Lotes" | Se muestra el campo de búsqueda y la etiqueta explicativa |
| 2 | Escribir el nombre o documento de un agricultor **con finca** | Aparecen resultados después de ~300ms |
| 3 | Observar el resultado del agricultor | Se muestra nombre, documento y el nombre de la finca en verde |
| 4 | Tocar el resultado | Navega a la pantalla de lotes de esa finca |
| 5 | Verificar el encabezado de la pantalla | Muestra el nombre de la finca |

---

## TC-03 — Agricultor sin finca registrada (caso borde)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ir al tab "Lotes" y buscar un agricultor sin finca | Aparece en los resultados |
| 2 | Observar el ítem del agricultor | Muestra "Sin finca registrada" en rojo y aparece con opacidad reducida |
| 3 | Intentar tocar el ítem | **No navega** — el ítem está deshabilitado |

---

## TC-04 — Búsqueda sin conexión

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Desactivar el WiFi/datos del dispositivo | |
| 2 | Ir al tab "Lotes" | Se muestra el banner amarillo "Sin conexión — la búsqueda de agricultores requiere conexión" |
| 3 | Intentar escribir en el campo de búsqueda | El campo aparece deshabilitado (fondo gris) y no responde |

---

## TC-05 — Pantalla de lotes de una finca (sin lotes previos)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Seleccionar un agricultor cuya finca no tiene lotes registrados | Navega a la pantalla de lotes |
| 2 | Observar el contenido | Se muestra "Sin lotes registrados" y el texto explicativo |
| 3 | Verificar el botón inferior | Se muestra el botón verde "**+ Capturar nuevo lote**" |

---

## TC-06 — Pantalla de lotes de una finca (con lotes ya sincronizados en el backend)

**Precondición:** Existe al menos un `FarmPlot` en el backend para la finca seleccionada.

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Seleccionar la finca con lotes en el backend | Navega a la pantalla de lotes |
| 2 | Esperar la carga | Aparece la lista con los lotes descargados del backend |
| 3 | Observar cada lote | Muestra nombre, número de puntos, badge "Sincronizado" en verde y fecha |
| 4 | Tocar "Actualizar" en el encabezado | Vuelve a descargar los lotes del backend y refresca la lista |

---

## TC-07 — Solicitud de permisos de ubicación (primera vez)

**Precondición:** Los permisos de ubicación NO han sido otorgados previamente.

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Desde la pantalla de lotes, tocar "**+ Capturar nuevo lote**" | Navega a la pantalla de captura |
| 2 | Observar el comportamiento inmediato | El SO muestra el diálogo nativo de permisos de ubicación |
| 3 | Verificar el texto del diálogo (iOS) | Dice "SOSAgro necesita acceso a tu ubicación GPS para registrar las coordenadas de la unidad productiva." |
| 4 | Otorgar el permiso | El diálogo se cierra; la pantalla muestra la interfaz de captura normalmente |

---

## TC-08 — Permiso de ubicación denegado

**Precondición:** Denegar el permiso cuando el SO lo solicite (o revocar en ajustes del dispositivo).

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ingresar a la pantalla de captura con permisos denegados | Se muestra la pantalla de error de permisos |
| 2 | Verificar el mensaje | Muestra "Permiso de ubicación requerido" con instrucciones para ir a Ajustes |
| 3 | Tocar "**Reintentar**" | Vuelve a solicitar el permiso al SO |
| 4 | Si el permiso fue denegado con "no preguntar de nuevo" (Android) | El botón Reintentar no muestra el diálogo; el usuario debe ir a Ajustes manualmente |

---

## TC-09 — Captura de puntos GPS

**Precondición:** Permisos de ubicación otorgados. El dispositivo tiene señal GPS.

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Abrir la pantalla de captura | Se muestra el banner amarillo "0 puntos capturados — mínimo 3 para cerrar el polígono" |
| 2 | Tocar "**Agregar punto GPS**" | El botón muestra un spinner y se deshabilita mientras adquiere señal |
| 3 | Esperar 2–10 segundos | El spinner desaparece; aparece una fila con el índice "1", las coordenadas decimales (ej. `3.861234, -76.543210`) y la precisión (ej. `±8 m`) |
| 4 | Tocar "Agregar punto GPS" dos veces más | Aparecen las filas 2 y 3 con coordenadas distintas |
| 5 | Observar el banner superior | Cambia a fondo verde: "3 puntos capturados — listo para cerrar" |
| 6 | Verificar que el botón azul "**Cerrar polígono y guardar**" está habilitado | Sí, el botón es interactivo |

---

## TC-10 — Botón "Cerrar polígono" deshabilitado con menos de 3 puntos

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Abrir la pantalla de captura | El botón "Cerrar polígono y guardar" está deshabilitado (gris) |
| 2 | Capturar 1 punto | Sigue deshabilitado |
| 3 | Capturar 2 puntos | Sigue deshabilitado |
| 4 | Capturar el 3er punto | El botón se habilita |

---

## TC-11 — Eliminar el último punto capturado

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Capturar al menos 1 punto | Aparece el botón rojo "**Quitar último**" |
| 2 | Tocar "Quitar último" | La última fila de la lista desaparece; el contador baja en 1 |
| 3 | Quitar todos los puntos | El botón "Quitar último" desaparece |

---

## TC-12 — Guardar el polígono (happy path)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Capturar al menos 3 puntos GPS | El botón azul está habilitado |
| 2 | Tocar "**Cerrar polígono y guardar**" | Aparece un modal desde abajo con campos "Nombre del lote" y "Descripción" |
| 3 | Dejar el campo nombre vacío y tocar "Guardar" | El botón "Guardar" permanece deshabilitado mientras el nombre está vacío |
| 4 | Escribir un nombre (ej. "Lote norte") | El botón "Guardar" se habilita |
| 5 | Escribir una descripción opcional (ej. "Café variedad Castillo") | |
| 6 | Tocar "**Guardar**" | El modal se cierra; navega de vuelta a la pantalla de lotes de la finca |
| 7 | Verificar la pantalla de lotes | Aparece el nuevo lote con badge **"Borrador"** en amarillo |

---

## TC-13 — Cancelar el modal de guardado

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Con puntos capturados, tocar "Cerrar polígono y guardar" | Abre el modal |
| 2 | Tocar "**Cancelar**" | El modal se cierra; los puntos se mantienen en pantalla |

---

## TC-14 — Alerta al intentar salir con puntos capturados

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Capturar al menos 1 punto en la pantalla de captura | |
| 2 | Tocar "← Volver" | Aparece el alert "¿Descartar puntos?" con opciones "Cancelar" y "Descartar" |
| 3 | Tocar "Cancelar" | El alert se cierra; se permanece en la pantalla de captura con los puntos intactos |
| 4 | Tocar "← Volver" de nuevo y tocar "Descartar" | Navega de vuelta a la pantalla de lotes; los puntos se pierden |

---

## TC-15 — Salir sin puntos capturados

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Entrar a la pantalla de captura sin capturar ningún punto | |
| 2 | Tocar "← Volver" | Navega de vuelta directamente, **sin mostrar el alert** |

---

## TC-16 — Sincronización del lote capturado offline

**Precondición:** Guardar el lote estando sin conexión (desactivar WiFi/datos antes de guardar).

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Desactivar WiFi/datos | |
| 2 | Capturar un polígono con ≥3 puntos y guardarlo | El lote aparece en la lista con badge "Borrador" |
| 3 | Ir al tab "Sincronización" | Aparece al menos 1 entrada pendiente |
| 4 | Activar WiFi/datos | La sincronización se dispara automáticamente (o tocar "Sincronizar ahora") |
| 5 | Volver al tab "Lotes" y seleccionar la misma finca | El lote ahora muestra badge **"Sincronizado"** en verde |
| 6 | Verificar en el backend | `GET /api/farm-plots/by-farm/:farmId` retorna el lote con su polígono |

---

## TC-17 — Persistencia de puntos al navegar fuera de la pantalla de captura

**Precondición:** El store Zustand mantiene los puntos en memoria mientras el proceso de la app está vivo.

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Capturar 2 puntos en la pantalla de captura | |
| 2 | Sin salir de la app, navegar a otro tab (ej. "Campañas") | |
| 3 | Volver al tab "Lotes" y entrar de nuevo a la pantalla de captura para la misma finca | Los 2 puntos **se mantienen** en la lista |

**Nota:** Si la app se cierra completamente y se vuelve a abrir, los puntos no capturados se pierden — esto es el comportamiento esperado.

---

## TC-18 — Pantalla de lotes sin conexión (datos locales)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Primero, con conexión, visitar la pantalla de lotes de una finca que tiene lotes guardados | Los lotes se descargan y persisten en SQLite |
| 2 | Desactivar WiFi/datos | |
| 3 | Volver a la pantalla de lotes de la misma finca | Se muestra el banner amarillo "Sin conexión" |
| 4 | Verificar que los lotes siguen visibles | Los lotes guardados localmente se muestran normalmente |
| 5 | Tocar "Actualizar" | El botón aparece deshabilitado |
