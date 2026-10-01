import { MAX_FONT_SCALE } from "../components/common/AppText";
import { TAB_BAR_PADDING_HORIZONTAL } from "./resolveTabBarStyle";

/** Tamaño de diseño de la etiqueta de pestaña (docs/design: metadato de tab bar). */
export const TAB_LABEL_BASE_FONT_SIZE = 11;

/**
 * JetBrains Mono es monoespaciada: cada carácter avanza 0.6 em. Eso permite
 * calcular el ancho de una etiqueta sin medirla en pantalla.
 */
const MONO_ADVANCE_RATIO = 0.6;

/** Aire a cada lado de la etiqueta dentro de su pestaña. */
const LABEL_SIDE_MARGIN = 1;

export interface ResolveTabLabelFontSizeParams {
  /** Ancho de la ventana en dp (`useWindowDimensions().width`). */
  windowWidth: number;
  /** Escala de letra del sistema (`useWindowDimensions().fontScale`). */
  fontScale: number;
  /** Etiquetas visibles, tal como se muestran. */
  labels: string[];
}

/**
 * Un ÚNICO tamaño de letra para todas las etiquetas del tab bar: el de diseño
 * (con la escala del sistema, topada en `MAX_FONT_SCALE`) o, si la etiqueta más
 * larga no cabe en su pestaña, el mayor tamaño con el que sí cabe.
 *
 * Reemplaza a `adjustsFontSizeToFit` por etiqueta (spec 92), que dejaba cada
 * pestaña con un tamaño distinto, y a `numberOfLines={1}` a secas (spec 74),
 * que las cortaba. La etiqueta se dibuja con `allowFontScaling={false}`: la
 * escala del sistema ya está aplicada aquí.
 */
export function resolveTabLabelFontSize({ windowWidth, fontScale, labels }: ResolveTabLabelFontSizeParams): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? Math.min(fontScale, MAX_FONT_SCALE) : 1;
  const desired = TAB_LABEL_BASE_FONT_SIZE * scale;
  if (labels.length === 0 || !Number.isFinite(windowWidth) || windowWidth <= 0) return desired;

  const tabWidth = (windowWidth - 2 * TAB_BAR_PADDING_HORIZONTAL) / labels.length;
  const longest = Math.max(...labels.map((label) => Array.from(label).length));
  const fit = (tabWidth - 2 * LABEL_SIDE_MARGIN) / (longest * MONO_ADVANCE_RATIO);

  // Se redondea hacia abajo a décimas para no quedar un subpíxel por encima.
  return Math.floor(Math.min(desired, fit) * 10) / 10;
}
