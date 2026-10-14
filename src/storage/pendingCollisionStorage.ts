import * as SecureStore from "expo-secure-store";

// Spec 68, Fase 10 — marcador de "Registro sin terminar por colisión de
// documento". Salir del aviso con «Atrás» deja la encuesta sincronizada, sin
// agricultor y con la colisión pendiente en el backend; nada local distingue
// ese caso de un Registro normal (la encuesta nunca guarda el `farmerId`
// extraído en línea). Este marcador es lo que permite ofrecer «Continuar» sin
// mostrarlo para todo Registro terminado. Vive en SecureStore (como el resto
// de preferencias pequeñas) para no abrir una migración de SQLite.
//
// SecureStore admite ~2048 bytes por valor y cada entrada pesa ~330: la lista
// se guarda **por encuestador** (tablet compartida, spec 86; así un usuario no
// desaloja los marcadores de otro y `forgetDevice()` puede borrar los suyos) y
// se limita a 5 entradas por usuario (~1,7 KB).
const keyFor = (userId: string) => `sosagro_pending_document_collisions_${userId}`;
const MAX_ENTRIES = 5;

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

async function readAll(userId: string): Promise<PendingCollisionEntry[]> {
  try {
    const raw = await SecureStore.getItemAsync(keyFor(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

async function writeAll(userId: string, list: PendingCollisionEntry[]): Promise<void> {
  try {
    if (list.length === 0) await SecureStore.deleteItemAsync(keyFor(userId));
    else await SecureStore.setItemAsync(keyFor(userId), JSON.stringify(list));
  } catch {
    // Best-effort: sin marcador solo se pierde la oferta de «Continuar».
  }
}

export const pendingCollisionStorage = {
  async add(entry: PendingCollisionEntry): Promise<void> {
    await writeAll(entry.userId, upsertEntry(await readAll(entry.userId), entry));
  },

  async remove(userId: string, ...surveyIds: (string | null | undefined)[]): Promise<void> {
    const all = await readAll(userId);
    const next = removeEntries(all, surveyIds);
    if (next.length !== all.length) await writeAll(userId, next);
  },

  async listFor(campaignId: string, userId: string): Promise<PendingCollisionEntry[]> {
    return filterForCampaign(await readAll(userId), campaignId, userId);
  },

  /** `forgetDevice()`: nombres y documentos de agricultores no deben quedar en la tablet. */
  async clearFor(userId: string): Promise<void> {
    await writeAll(userId, []);
  },
};
