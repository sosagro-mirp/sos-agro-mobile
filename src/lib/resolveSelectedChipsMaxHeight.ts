// Spec 87 (D5/D6): tope de altura del bloque de opciones seleccionadas de una
// pregunta de selección múltiple. Se mide en FILAS de chips (no en píxeles
// fijos): con el escalado de fuente del sistema los chips crecen, y un tope
// fijo recortaría filas a media altura.

export const SELECTED_CHIPS_MAX_ROWS = 2;
export const SELECTED_CHIPS_GAP = 8;
// Altura estimada de una fila de chips a escala de fuente 1 (padding 6+6 y una
// línea de 12.5 px), mientras no se haya medido el primer chip.
export const DEFAULT_CHIP_ROW_HEIGHT = 32;

export function resolveSelectedChipsMaxHeight(input: {
  rowHeight: number;
  gap: number;
  maxRows: number;
}): number {
  const rows = Math.max(1, Math.floor(input.maxRows));
  const rowHeight = input.rowHeight > 0 ? input.rowHeight : DEFAULT_CHIP_ROW_HEIGHT;
  const gap = Math.max(0, input.gap);
  return rowHeight * rows + gap * (rows - 1);
}
