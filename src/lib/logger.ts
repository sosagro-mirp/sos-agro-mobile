import { AppState, type AppStateStatus } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const LOG_DIR = FileSystem.documentDirectory + 'logs/';
const MAX_AGE_DAYS = 7;

/**
 * Spec 76, Fase 4 — escritura por segmentos.
 *
 * Antes, `appendToFile()` leía el archivo del día completo en memoria y lo
 * reescribía entero en CADA línea de log: coste cuadrático (con 5 MB
 * acumulados, escribir una línea movía 10 MB de I/O) y, además, una condición
 * de carrera — dos escrituras concurrentes leían el mismo contenido previo y
 * una pisaba a la otra, perdiendo líneas en silencio.
 *
 * Eso lo convertía en un amplificador justo cuando más falta hace: bajo el
 * bucle de remontaje del 2026-08-18 —que llamaba `logger.init()` en cada uno
 * de sus ~30 ciclos por segundo— el logger competía por el hilo con la propia
 * app, y los ANRs de esa ventana (Sentry REACT-NATIVE-4/5/7/8) son
 * consistentes con esa presión de I/O.
 *
 * Ahora el día se guarda en segmentos acotados (`YYYY-MM-DD.NNN.log`):
 *  - Nada se relee jamás para escribir. El contenido del segmento activo vive
 *    en memoria y se escribe completo, pero está acotado a MAX_SEGMENT_BYTES,
 *    así que el coste por escritura NO depende del total acumulado del día.
 *  - Las líneas se acumulan en un buffer y se vuelcan en una única cadena de
 *    promesas serializada: dos llamadas concurrentes no pueden pisarse.
 *  - `getLogs()` reagrupa los segmentos por fecha, así que para quien lo
 *    consume (`/dev/logs`) el formato de salida no cambia.
 */
const MAX_SEGMENT_BYTES = 256 * 1024;
/** Retardo del volcado: agrupa ráfagas de líneas en una sola escritura. */
const FLUSH_DELAY_MS = 400;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFile {
  date: string;
  content: string;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function segmentPath(date: string, index: number): string {
  return `${LOG_DIR}${date}.${String(index).padStart(3, '0')}.log`;
}

/** `2026-08-26.004.log` → `2026-08-26`; tolera el formato antiguo `2026-08-26.log`. */
function dateFromFileName(fileName: string): string {
  return fileName.slice(0, 10);
}

function formatEntry(level: LogLevel, message: string): string {
  return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`;
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(LOG_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(LOG_DIR, { intermediates: true });
  }
}

// --- Estado del segmento activo (en memoria, nunca releído del disco) ---
let segmentDate = '';
let segmentIndex = 0;
let segmentContent = '';

/**
 * Fechas para las que ya se resolvió el índice inicial de segmento **en esta
 * ejecución del proceso**. Bug corregido tras la auditoría del spec 76
 * (`docs/reports/auditorias/35-...`): al arrancar la app, `segmentDate` vuelve
 * a estar vacío, así que el primer `write()` del día entraba por
 * `date !== segmentDate` y arrancaba siempre en el índice `000` — pisando el
 * segmento que había dejado la ejecución anterior. Si esa ejecución anterior
 * había crasheado, el reinicio borraba justo el log de la corrida que crasheó
 * (la evidencia que `TC-076-01` necesita). Ahora, la primera vez que se
 * escribe para una fecha dada en este proceso, se lista `LOG_DIR` y se
 * arranca en `máximo índice existente + 1`, sin releer ningún contenido — se
 * sigue sin releer nada para escribir, solo se lee el *nombre* de los
 * archivos para no repetir un índice.
 */
const resolvedDates = new Set<string>();

let buffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Cadena serializada de escrituras: garantiza que no se pisen entre sí. */
let writeChain: Promise<void> = Promise.resolve();

async function nextIndexForDate(date: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(LOG_DIR);
  if (!info.exists) return 0;

  const files = await FileSystem.readDirectoryAsync(LOG_DIR);
  const prefix = `${date}.`;
  let maxIndex = -1;
  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const index = Number(file.slice(prefix.length, prefix.length + 3));
    if (!isNaN(index) && index > maxIndex) maxIndex = index;
  }
  return maxIndex + 1;
}

async function startSegmentForDate(date: string): Promise<void> {
  segmentDate = date;
  segmentIndex = resolvedDates.has(date) ? segmentIndex + 1 : await nextIndexForDate(date);
  resolvedDates.add(date);
  segmentContent = '';
}

function startNewSegmentSameDate(): void {
  // Rotación por tamaño dentro del mismo `flushBuffer()`: la fecha ya se
  // resolvió en esta pasada, así que basta con avanzar el índice en memoria.
  segmentIndex += 1;
  segmentContent = '';
}

async function writeCurrentSegment(): Promise<void> {
  await FileSystem.writeAsStringAsync(segmentPath(segmentDate, segmentIndex), segmentContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

async function flushBuffer(): Promise<void> {
  if (buffer.length === 0) return;

  const entries = buffer;
  buffer = [];

  await ensureDir();

  const date = todayKey();
  if (date !== segmentDate) await startSegmentForDate(date);

  for (const entry of entries) {
    if (segmentContent.length + entry.length > MAX_SEGMENT_BYTES && segmentContent.length > 0) {
      // Encontrado al escribir el test de rotación de la auditoría del spec
      // 76: si una ráfaga cruza MAX_SEGMENT_BYTES dentro de un mismo
      // `flushBuffer()`, el segmento que se está por abandonar debe
      // persistirse ANTES de rotar — de lo contrario solo el último segmento
      // de la ráfaga llegaba a disco y los anteriores se perdían en silencio.
      await writeCurrentSegment();
      startNewSegmentSameDate();
    }
    segmentContent += entry;
  }

  await writeCurrentSegment();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    writeChain = writeChain.then(flushBuffer).catch(console.error);
  }, FLUSH_DELAY_MS);
}

function write(level: LogLevel, message: string): void {
  buffer.push(formatEntry(level, message));
  scheduleFlush();
}

async function deleteOldLogs(): Promise<void> {
  const info = await FileSystem.getInfoAsync(LOG_DIR);
  if (!info.exists) return;

  const files = await FileSystem.readDirectoryAsync(LOG_DIR);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

  for (const file of files) {
    const fileDate = new Date(dateFromFileName(file));
    if (!isNaN(fileDate.getTime()) && fileDate < cutoff) {
      await FileSystem.deleteAsync(LOG_DIR + file, { idempotent: true });
    }
  }
}

let appStateSubscribed = false;

/**
 * Auditoría del spec 76 (mayor, no bloqueante): el buffer se vuelca con
 * FLUSH_DELAY_MS de retardo, así que un crash nativo justo después de un
 * `logger.error(...)` podía perder las últimas líneas — las de más valor
 * forense, porque suelen ser las que preceden al crash. Al pasar a segundo
 * plano (o inactivo) se fuerza el volcado inmediato.
 */
function handleAppStateChange(state: AppStateStatus): void {
  if (state === 'background' || state === 'inactive') {
    logger.flush().catch((e) => console.error('[logger] flush on background failed', e));
  }
}

export const logger = {
  async init(): Promise<void> {
    try {
      await ensureDir();
      await deleteOldLogs();
      if (!appStateSubscribed) {
        appStateSubscribed = true;
        AppState.addEventListener('change', handleAppStateChange);
      }
    } catch (e) {
      console.error('[logger] init error', e);
    }
  },

  debug(message: string): void {
    write('debug', message);
  },

  info(message: string): void {
    write('info', message);
  },

  warn(message: string): void {
    write('warn', message);
  },

  error(message: string, error?: unknown): void {
    const detail =
      error instanceof Error
        ? ` — ${error.name}: ${error.message}`
        : error !== undefined
        ? ` — ${String(error)}`
        : '';
    write('error', message + detail);
  },

  /**
   * Fuerza el volcado inmediato de lo que haya en el buffer y espera a que
   * termine toda la cadena de escrituras pendientes. Pensado para las pruebas
   * y para puntos en los que interesa no perder el log (p. ej. antes de
   * exportarlo).
   */
  async flush(): Promise<void> {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    writeChain = writeChain.then(flushBuffer);
    await writeChain;
  },

  async getLogs(): Promise<LogFile[]> {
    try {
      await logger.flush();

      const info = await FileSystem.getInfoAsync(LOG_DIR);
      if (!info.exists) return [];

      const files = await FileSystem.readDirectoryAsync(LOG_DIR);
      const byDate = new Map<string, string>();

      // El orden alfabético de `YYYY-MM-DD.NNN.log` ya es el cronológico.
      for (const file of files.sort()) {
        const date = dateFromFileName(file);
        const content = await FileSystem.readAsStringAsync(LOG_DIR + file, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        byDate.set(date, (byDate.get(date) ?? '') + content);
      }

      return [...byDate.entries()].map(([date, content]) => ({ date, content }));
    } catch {
      return [];
    }
  },

  async exportLogs(): Promise<string> {
    const logs = await logger.getLogs();
    return logs.map((l) => `=== ${l.date} ===\n${l.content}`).join('\n');
  },
};
