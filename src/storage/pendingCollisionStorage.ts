import * as SecureStore from "expo-secure-store";

// Spec 68, Fase 10 — marcador de "Registro sin terminar por colisión de
// documento". Salir del aviso con «Atrás» deja la encuesta sincronizada, sin
// agricultor y con la colisión pendiente en el backend; nada local distingue
// ese caso de un Registro normal (la encuesta nunca guarda el `farmerId`
// extraído en línea). Este marcador es lo que permite ofrecer «Continuar» sin
// mostrarlo para todo Registro terminado. Vive en SecureStore (como el resto
// de preferencias pequeñas) para no abrir una migración de SQLite.
const KEY = "sosagro_pending_document_collisions";
const MAX_ENTRIES = 10;

export interface PendingCollisionEntry {
  /** Id local de la encuesta de Registro (o S1 en el flujo legado). */
  surveyId: string;
  phase: "registro" | "s1";
  /** Id de la sesión de campaña (real o local). */
  sessionId: string;
  campaignId: string;
  userId: string;
  documentId: string;
  submittedName: string;
  createdAt: number;
}

/** Inserta o reemplaza por `surveyId`; conserva solo las `MAX_ENTRIES` más recientes. */
export function upsertEntry(
  list: PendingCollisionEntry[],
  entry: PendingCollisionEntry,
): PendingCollisionEntry[] {
  const next = [...list.filter((e) => e.surveyId !== entry.surveyId), entry];
  return next.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ENTRIES);
}

export function removeEntries(
  list: PendingCollisionEntry[],
  surveyIds: (string | null | undefined)[],
): PendingCollisionEntry[] {
  const ids = new Set(surveyIds.filter((v): v is string => !!v));
  return list.filter((e) => !ids.has(e.surveyId));
}

export function filterForCampaign(
  list: PendingCollisionEntry[],
  campaignId: string,
  userId: string,
): PendingCollisionEntry[] {
  return list.filter((e) => e.campaignId === campaignId && e.userId === userId);
}

function isEntry(v: unknown): v is PendingCollisionEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.surveyId === "string" &&
    (e.phase === "registro" || e.phase === "s1") &&
    typeof e.sessionId === "string" &&
    typeof e.campaignId === "string" &&
    typeof e.userId === "string" &&
    typeof e.documentId === "string" &&
    typeof e.submittedName === "string" &&
    typeof e.createdAt === "number"
  );
}

async function readAll(): Promise<PendingCollisionEntry[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

async function writeAll(list: PendingCollisionEntry[]): Promise<void> {
  try {
    if (list.length === 0) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, JSON.stringify(list));
  } catch {
    // Best-effort: sin marcador solo se pierde la oferta de «Continuar».
  }
}

export const pendingCollisionStorage = {
  async add(entry: PendingCollisionEntry): Promise<void> {
    await writeAll(upsertEntry(await readAll(), entry));
  },

  async remove(...surveyIds: (string | null | undefined)[]): Promise<void> {
    const all = await readAll();
    const next = removeEntries(all, surveyIds);
    if (next.length !== all.length) await writeAll(next);
  },

  async listFor(campaignId: string, userId: string): Promise<PendingCollisionEntry[]> {
    return filterForCampaign(await readAll(), campaignId, userId);
  },
};
