import * as FileSystem from 'expo-file-system/legacy';

const LOG_DIR = FileSystem.documentDirectory + 'logs/';
const MAX_AGE_DAYS = 7;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFile {
  date: string;
  content: string;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function logFilePath(date: string): string {
  return `${LOG_DIR}${date}.log`;
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

async function appendToFile(filePath: string, entry: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(filePath);
  if (info.exists) {
    const existing = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await FileSystem.writeAsStringAsync(filePath, existing + entry, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } else {
    await FileSystem.writeAsStringAsync(filePath, entry, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
}

function write(level: LogLevel, message: string): void {
  const entry = formatEntry(level, message);
  ensureDir()
    .then(() => appendToFile(logFilePath(todayKey()), entry))
    .catch(console.error);
}

async function deleteOldLogs(): Promise<void> {
  const info = await FileSystem.getInfoAsync(LOG_DIR);
  if (!info.exists) return;

  const files = await FileSystem.readDirectoryAsync(LOG_DIR);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

  for (const file of files) {
    // file name format: YYYY-MM-DD.log
    const datePart = file.replace('.log', '');
    const fileDate = new Date(datePart);
    if (!isNaN(fileDate.getTime()) && fileDate < cutoff) {
      await FileSystem.deleteAsync(LOG_DIR + file, { idempotent: true });
    }
  }
}

export const logger = {
  async init(): Promise<void> {
    try {
      await ensureDir();
      await deleteOldLogs();
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

  async getLogs(): Promise<LogFile[]> {
    try {
      const info = await FileSystem.getInfoAsync(LOG_DIR);
      if (!info.exists) return [];

      const files = await FileSystem.readDirectoryAsync(LOG_DIR);
      const results: LogFile[] = [];

      for (const file of files.sort()) {
        const date = file.replace('.log', '');
        const content = await FileSystem.readAsStringAsync(LOG_DIR + file, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        results.push({ date, content });
      }

      return results;
    } catch {
      return [];
    }
  },

  async exportLogs(): Promise<string> {
    const logs = await logger.getLogs();
    return logs.map((l) => `=== ${l.date} ===\n${l.content}`).join('\n');
  },
};
