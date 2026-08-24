# Diseño de la app móvil — SosAgro 4.C

Fuente de verdad visual de la app de campo. Todo cambio de UI de `mobile/` se
contrasta contra estos archivos. El plan de migración vive en
`spec/74_migracion_ui_mobile_diseno_nuevo.md` (raíz del ecosistema).

## Origen

| Dato | Valor |
|---|---|
| Proyecto en Claude Design | `e77cdb2d-f7d6-4d53-9896-ad4b14cf1aec` — "SosAgro landing page rediseño" |
| URL | https://claude.ai/design/p/e77cdb2d-f7d6-4d53-9896-ad4b14cf1aec?file=SosAgro+Mobile.dc.html |
| Fecha de importación | 2026-08-24 |
| Prompt que lo originó | conversación de Claude Code del 2026-08-24 (rediseño mobile/tablet) |

## Archivos

| Archivo | Contenido |
|---|---|
| `SosAgro-Mobile.dc.html` | Lienzo contenedor: navegación por pantalla y estado, pares claro/oscuro, las dos vistas de tablet y la **hoja de sistema** (escala tipográfica, métricas, paleta, mapa de íconos, resolución de las 10 deudas, recomendación de variante de flujo). |
| `SosAgro-Mobile-Screen.dc.html` | Componente que dibuja **todas** las pantallas del teléfono (390×844), parametrizado por `theme`, `screen`, `state` y `pending`. Es el archivo a leer para el detalle de cualquier pantalla. |

> Son copias locales de referencia. **No se renderizan fuera de Claude Design**
> (dependen de su runtime `support.js`): para verlos, abrir la URL de arriba.
> Para leer el detalle exacto de una pantalla, leer el HTML — los estilos están
> inline y las variables CSS son los tokens de abajo.

## Tokens

Los mockups usan variables CSS que mapean 1:1 contra `src/theme/colors.ts`.

| Variable del diseño | Token en `ThemeColors` | Claro | Oscuro |
|---|---|---|---|
| `--bg` / `--surf` | `background` / `surface` | `#FFFFFF` | `#0F172A` |
| `--surfM` | `surfaceMuted` | `#F9FAFB` | `#1E293B` |
| `--tp` / `--tm` | `textPrimary` / `textMuted` | `#111827` / `#6B7280` | `#F1F5F9` / `#94A3B8` |
| `--bd` / `--bds` | `border` / `borderStrong` | `#E5E7EB` / `#D1D5DB` | `#334155` / `#64748B` |
| `--br` / `--brH` / `--brFg` | `brand` / `brandHover` / `brandForeground` | `#1B6B3A` / `#14532D` / `#FFFFFF` | `#FDE047` / `#FACC15` / `#0F172A` |
| `--brSb` / `--brSf` | `brandSubtleBg` / `brandSubtleFg` | `#F0FDF4` / `#1B6B3A` | `#422006` / `#FDE047` |
| `--okB` / `--okF` | `successBg` / `successFg` | `#F0FDF4` / `#16A34A` | `#052E16` / `#4ADE80` |
| `--dgB` / `--dgF` | `dangerBg` / `dangerFg` | `#FEF2F2` / `#DC2626` | `#450A0A` / `#F87171` |
| `--wnB` / `--wnF` | `warningBg` / `warningFg` | `#FEF3C7` / `#92400E` | `#451A03` / `#FBBF24` |
| `--inB` / `--inF` | `infoBg` / `infoFg` | `#DBEAFE` / `#1D4ED8` | `#172554` / `#60A5FA` |

**Tokens nuevos que el diseño introduce** y que hoy no existen en `colors.ts`:

| Variable | Para qué | Claro | Oscuro |
|---|---|---|---|
| `--hdr` | Fondo del header de la app | `#1B6B3A` (marca) | `#1E293B` — **ya no amarillo** |
| `--hdrFg` | Texto sobre el header | `#FFFFFF` | `#F1F5F9` |
| `--hdrSub` | Texto secundario del header | `rgba(255,255,255,.72)` | `#94A3B8` |
| `--hdrPill` | Fondo de píldoras/botones dentro del header | `rgba(255,255,255,.16)` | `rgba(241,245,249,.08)` |
| `--hdrBd` | Bordes dentro del header | `rgba(255,255,255,.32)` | `#334155` |
| `--skel` | Fondo de los skeletons | `#EFF1F4` | `#1E293B` |

## Métricas

| Métrica | Valor |
|---|---|
| Grilla base | múltiplos de 4 |
| Padding de pantalla | 14 px |
| Altura mínima de control | 48 dp |
| Fila de opción de respuesta | 56 dp |
| Botón primario | 17 px de padding vertical |
| Radio · tarjeta / botón | 12 / 11 px |
| Radio · bottom sheet | 20 px arriba |
| Radio · badge y píldora | 99 px |
| Chrome de la pantalla de pregunta | 52 px en total |
| Columna de lectura en tablet | 560 px máx. |
| Breakpoint de tablet | ≥ 720 dp lógicos |

## Escala tipográfica (JetBrains Mono)

| Uso | Tamaño / peso |
|---|---|
| Éxito a pantalla completa | 24 / 800 |
| Título de pantalla de flujo | 20 / 800 |
| Título de pestaña | 19 / 800 |
| Texto de pregunta | 17 / 700 |
| Opción de respuesta | 14.5 / 500 |
| Metadato | 11.5 / 400 |
| Etiqueta en mayúsculas | 10 / 800 |

## Mapa de reemplazo de emojis y glifos

| Antes | Ícono lucide | Tamaño | Dónde |
|---|---|---|---|
| 📡 | `WifiOff` | 24 / 36 | Sin conexión a pantalla completa y banners |
| ⚠️ | `TriangleAlert` | 36 | Errores del orquestador a pantalla completa |
| ⚠️ | `CircleAlert` | 16 / 20 | Alertas inline, obligatorias sin responder, errores de sync |
| ✓ | `Check` | 16 / 20 / 42 | Guardado, sincronizado, caché lista, encuesta completada |
| ✕ / × | `X` | 20 | Salir de la encuesta, cerrar índice, quitar chip |
| → | `ArrowRight` | 18 / 19 | «Siguiente», «Continuar», «Toca para editar» |
| ← | `ChevronLeft` | 20 / 21 | Header de retroceso y botón «Anterior» |
| + | `Plus` | 18 / 20 | Nuevo encuestado, agregar punto GPS, capturar lote |
| 🗑 | `Trash2` | 18 | Borrar borrador, quitar foto, limpiar cola |
| — | `LoaderCircle` | 16 / 42 | Reemplaza todo `ActivityIndicator` y el texto «Cargando…» |

## Pantallas y estados disponibles en el lienzo

| `screen` | `state` |
|---|---|
| `login` | — |
| `campanas` | `datos`, `descargando`, `sin-conexion`, `vacio`, `cargando` (+ toggle de banda de pendientes) |
| `pre` | `vacio`, `resultados`, `sin-resultados` |
| `inicio` | — |
| `varA` | `opcion`, `cumplimiento`, `imagen`, `gps` |
| `varB` | `seccion`, `foco`, `indice` |
| `revision` | `lista`, `completada` |
| `orq` | `transicion`, `error`, `duplicado`, `documento` |
| `borradores` | `datos`, `modal`, `vacio` |
| `sync` | `todo`, `pendientes`, `errores` |
| `solicitudes` | — |
| `lotes` | `busqueda`, `lista`, `captura`, `sheet` |
| `tabletA` / `tabletB` / `sistema` | — |

## Decisiones de diseño a respetar

1. **El header deja de ser verde/amarillo en oscuro** y pasa a `surfaceMuted`
   con borde. Elimina el amarillo-sobre-amarillo y los overlays derivados que
   hubo que inventar en el spec 63. El verde institucional queda para bloques
   fijos de marca (login), no para chrome.
2. **Una sola jerarquía de conectividad, en tres niveles**: píldora del header
   (estado permanente) → banner ámbar por pantalla (solo si la falta de red
   limita algo de esa pantalla) → control deshabilitado con etiqueta
   `REQUIERE CONEXIÓN` en el momento de la acción bloqueada. Nunca los tres
   a la vez para el mismo hecho.
3. **Un solo léxico de estado de cola**: ámbar + `Clock` = pendiente, verde +
   `Check` = sincronizado, rojo + `CircleAlert` = con error, ámbar +
   `Paperclip` = adjunto sin subir. Contadores en cero apagados a neutro.
4. **Toda acción destructiva es un contenedor** (borde rojo, fondo `dangerBg`,
   ícono + label), nunca texto rojo suelto, y toda destrucción pasa por un
   bottom sheet que nombra lo que se pierde en cantidad y en persona.
5. **El autoguardado se comunica en tres lugares y solo tres**: chip
   «Guardado» del header de pregunta, resumen de la pantalla de completada, y
   banda de pendientes del shell. Sin toast por respuesta.
6. **Los ids técnicos salen de la jerarquía principal**: las tarjetas de error
   se identifican por instrumento + agricultor + hora; el id queda en 9.5 px
   como línea secundaria.
7. **El croquis del polígono es geometría local**: SVG autoescalado sobre
   grilla, área aproximada por la fórmula de Gauss. Sin conexión, sin tiles,
   sin mapas externos.

## Flujo de encuesta: dos variantes

El lienzo entrega dos flujos completos y **recomienda la Variante B con el modo
foco de A**:

- **Variante A — wizard refinado** (`screen=varA`): una pregunta por pantalla,
  con el chrome comprimido a 52 px.
- **Variante B — sección por pantalla** (`screen=varB`): la unidad de
  navegación es la sección; las preguntas simples se responden inline en
  tarjetas y las complejas (audio, imagen, GPS, listas largas) abren el modo
  foco — que es una sola pantalla por vez, así que conserva el patrón `replace`
  y no reintroduce el riesgo de `TransactionTooLargeException`.

La adopción de la Variante B **no está decidida**: es la Fase 9 del spec 74 y
tiene su propia compuerta de aprobación.
