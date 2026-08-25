/**
 * Geometría local del croquis de lote — spec 74, Fase 8. Funciones puras,
 * sin dependencias: todo el croquis vectorial (SVG autoescalado, área
 * aproximada) vive en el dispositivo, sin mapas ni tiles externos (decisión
 * de diseño 7 del spec).
 *
 * Tests: `src/__tests__/e2e-074-rediseno-mobile.test.ts`.
 */

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface ViewBox {
  width: number;
  height: number;
  margin: number;
}

// Metros por grado de latitud — aproximación estándar (WGS84 varía muy poco
// con la latitud, ~0.5% entre ecuador y polo; suficiente para un croquis de
// referencia visual, no para catastro). La longitud se corrige por
// `cos(lat)` en cada punto.
const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Proyecta lat/lng a un plano cartesiano local en metros, tomando el primer
 * punto como referencia para la corrección de longitud (`cos(lat)`). Válido
 * para polígonos pequeños (un lote agrícola, no un país) — el error crece
 * con la distancia al punto de referencia, irrelevante a esta escala.
 */
function toLocalMeters(points: LatLngPoint[]): ProjectedPoint[] {
  if (points.length === 0) return [];
  const cosLat = Math.cos((points[0].lat * Math.PI) / 180);
  return points.map((p) => ({
    x: p.lng * METERS_PER_DEGREE_LAT * cosLat,
    y: p.lat * METERS_PER_DEGREE_LAT,
  }));
}

/**
 * Área aproximada del polígono en hectáreas, por la fórmula de Gauss
 * (shoelace) sobre la proyección local en metros. `Math.abs()` la hace
 * independiente del sentido (horario/antihorario) de captura. Menos de 3
 * puntos no forman un polígono — devuelve 0.
 */
export function polygonAreaHectares(points: LatLngPoint[]): number {
  if (points.length < 3) return 0;

  const m = toLocalMeters(points);
  let sum = 0;
  for (let i = 0; i < m.length; i++) {
    const a = m[i];
    const b = m[(i + 1) % m.length];
    sum += a.x * b.y - b.x * a.y;
  }
  const areaSquareMeters = Math.abs(sum) / 2;
  return areaSquareMeters / 10_000;
}

/**
 * Proyecta los vértices a un `viewBox` de `width`×`height` con `margin` en
 * cada borde, autoescalando para conservar la relación de aspecto real del
 * polígono (nunca lo estira). Robusto a un polígono degenerado (todos los
 * puntos iguales, ej. justo después de tocar "Agregar punto" la primera
 * vez): no divide por cero, centra el punto único en el viewBox.
 */
export function projectPolygon(points: LatLngPoint[], viewBox: ViewBox): ProjectedPoint[] {
  if (points.length === 0) return [];

  const { width, height, margin } = viewBox;
  const availableWidth = Math.max(width - margin * 2, 1);
  const availableHeight = Math.max(height - margin * 2, 1);

  const m = toLocalMeters(points);
  const xs = m.map((p) => p.x);
  const ys = m.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  const EPSILON = 1e-9;
  const degenerate = spanX < EPSILON && spanY < EPSILON;
  const scale = degenerate
    ? 1
    : Math.min(
        spanX < EPSILON ? Infinity : availableWidth / spanX,
        spanY < EPSILON ? Infinity : availableHeight / spanY,
      );
  const safeScale = Number.isFinite(scale) ? scale : 1;

  const scaledWidth = spanX * safeScale;
  const scaledHeight = spanY * safeScale;
  const offsetX = margin + (availableWidth - scaledWidth) / 2;
  const offsetY = margin + (availableHeight - scaledHeight) / 2;

  return m.map((p) => ({
    x: offsetX + (p.x - minX) * safeScale,
    // Y se invierte: la latitud crece hacia el norte, pero el eje Y de SVG
    // crece hacia abajo — sin esto el croquis quedaría reflejado.
    y: offsetY + (spanY - (p.y - minY)) * safeScale,
  }));
}
