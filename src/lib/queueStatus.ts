import type { ThemeColors } from "../theme/colors";

/**
 * Léxico único de estado de cola (spec 74, deuda #9): un solo par color+ícono
 * por estado, reutilizado en Sincronización, Borradores y las tarjetas de
 * error de sync — nunca reinventado pantalla por pantalla.
 */
export type QueueStatusKind = "pending" | "synced" | "failed" | "attachment";

export type QueueStatusIconName = "Clock" | "Check" | "CircleAlert" | "Paperclip";

export interface QueueStatusVisual {
  icon: QueueStatusIconName;
  fg: string;
  bg: string;
}

export function resolveQueueStatus(kind: QueueStatusKind, colors: ThemeColors): QueueStatusVisual {
  switch (kind) {
    case "pending":
      return { icon: "Clock", fg: colors.warningFg, bg: colors.warningBg };
    case "synced":
      return { icon: "Check", fg: colors.successFg, bg: colors.successBg };
    case "failed":
      return { icon: "CircleAlert", fg: colors.dangerFg, bg: colors.dangerBg };
    case "attachment":
      return { icon: "Paperclip", fg: colors.warningFg, bg: colors.warningBg };
  }
}

export interface CounterTone {
  fg: string;
  bg: string;
}

/**
 * Los contadores en cero se apagan a neutro (spec 74, deuda #9) para que el
 * ojo vaya solo a lo que sí requiere acción, en vez de resaltar un "0" en
 * ámbar o rojo como si fuera un problema.
 */
export function resolveCounterTone(
  count: number,
  kind: QueueStatusKind,
  colors: ThemeColors,
): CounterTone {
  if (count === 0) {
    return { fg: colors.textMuted, bg: colors.surfaceMuted };
  }
  const status = resolveQueueStatus(kind, colors);
  return { fg: status.fg, bg: status.bg };
}
