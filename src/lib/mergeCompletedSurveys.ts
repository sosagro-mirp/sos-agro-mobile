import type { MySurveyItem } from "../types";

// Spec 92, D7 — mismo contrato que devolverá `surveyDraftStore.listFinished()`
// en la Fase 3b (bloqueada por el spec 86). Se define aquí porque
// `mergeCompletedSurveys` es lógica pura y no depende de esa fase.
export interface LocalFinishedSurvey {
  clientSurveyId: string;
  backendSurveyId?: string | null;
  status: "completed" | "synced";
  syncFailed: boolean;
  farmerName: string | null;
  farmerDocumentId: string | null;
  instrumentName: string | null;
  responseCount: number;
  createdAt: string;
}

export type CompletedSurveySubmissionStatus = "pending" | "sent" | "failed";

export interface CompletedSurveyListItem {
  key: string;
  surveyId: string | null;
  clientSurveyId: string | null;
  instrumentName: string | null;
  campaignName: string | null;
  farmerName: string | null;
  responseCount: number;
  date: string;
  dateSource: "local" | "server";
  submissionStatus: CompletedSurveySubmissionStatus;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function submissionStatusFor(local: LocalFinishedSurvey | undefined): CompletedSurveySubmissionStatus {
  if (!local) return "sent";
  if (local.syncFailed) return "failed";
  // Una local `completed` se muestra "Pendiente de envío" aunque el servidor
  // ya la tenga: el dispositivo todavía no confirmó el envío (D7).
  if (local.status === "completed") return "pending";
  return "sent";
}

function matchesSearch(farmerName: string | null, farmerDocumentId: string | null, needle: string): boolean {
  const normalizedNeedle = normalize(needle);
  return [farmerName, farmerDocumentId]
    .filter((value): value is string => Boolean(value))
    .some((value) => normalize(value).includes(normalizedNeedle));
}

/**
 * Combina el historial remoto (acumulado de todas las páginas cargadas de
 * `GET /api/surveys/mine`) con las encuestas locales `completed`/`synced` del
 * encuestador activo. El servidor es la autoridad sobre el contenido; el
 * dispositivo local aporta la fecha de aplicación real (D6) y el estado de
 * envío mientras no se confirme la sincronización (D7).
 */
export interface MergeCompletedSurveysOptions {
  /**
   * Modo local (spec 92, Alcance 4): sin acumulado del servidor, las locales
   * `synced` sí aportan fila propia — es lo único que hay para mostrar.
   */
  includeSyncedLocals?: boolean;
  /**
   * En modo remoto el servidor ya filtró `search` (por nombre o documento);
   * el filtro local solo aplica a las filas que no vienen del servidor, para
   * no descartar una coincidencia por documento que el dispositivo no conoce.
   */
  remoteFiltered?: boolean;
}

export function mergeCompletedSurveys(
  remoteItems: MySurveyItem[],
  localItems: LocalFinishedSurvey[],
  search?: string,
  options: MergeCompletedSurveysOptions = {},
): CompletedSurveyListItem[] {
  const localByClientId = new Map(localItems.map((local) => [local.clientSurveyId, local]));
  const localByBackendId = new Map(
    localItems
      .filter((local): local is LocalFinishedSurvey & { backendSurveyId: string } => Boolean(local.backendSurveyId))
      .map((local) => [local.backendSurveyId, local]),
  );

  const remoteKeys = new Set<string>();
  const consumedLocalIds = new Set<string>();
  const seenSurveyIds = new Set<string>();
  const results: CompletedSurveyListItem[] = [];

  for (const remote of remoteItems) {
    if (seenSurveyIds.has(remote.surveyId)) continue;
    seenSurveyIds.add(remote.surveyId);

    const local =
      (remote.clientSurveyId ? localByClientId.get(remote.clientSurveyId) : undefined) ??
      localByBackendId.get(remote.surveyId);
    if (local) consumedLocalIds.add(local.clientSurveyId);
    const key = local?.clientSurveyId ?? `remote:${remote.surveyId}`;
    remoteKeys.add(key);

    results.push({
      key,
      surveyId: remote.surveyId,
      clientSurveyId: local?.clientSurveyId ?? remote.clientSurveyId,
      instrumentName: remote.instrumentName,
      campaignName: remote.campaignName,
      farmerName: remote.farmer?.name ?? local?.farmerName ?? null,
      responseCount: remote.responseCount,
      date: local?.createdAt ?? remote.createdAt,
      dateSource: local ? "local" : "server",
      submissionStatus: submissionStatusFor(local),
    });
  }

  for (const local of localItems) {
    if (consumedLocalIds.has(local.clientSurveyId)) continue;
    // Ya sincronizada pero sin fila propia del servidor en el acumulado
    // (todavía no llegó esa página, o quedó huérfana): no se agrega — el
    // servidor es la autoridad y evita una fila fantasma.
    if (local.status === "synced" && !options.includeSyncedLocals) continue;

    results.push({
      key: local.clientSurveyId,
      surveyId: local.backendSurveyId ?? null,
      clientSurveyId: local.clientSurveyId,
      instrumentName: local.instrumentName,
      campaignName: null,
      farmerName: local.farmerName,
      responseCount: local.responseCount,
      date: local.createdAt,
      dateSource: "local",
      submissionStatus: submissionStatusFor(local),
    });
  }

  const needle = search?.trim();
  const filtered = needle
    ? results.filter((item) => {
        if (options.remoteFiltered && remoteKeys.has(item.key)) return true;
        const local = item.clientSurveyId ? localByClientId.get(item.clientSurveyId) : undefined;
        return matchesSearch(item.farmerName, local?.farmerDocumentId ?? null, needle);
      })
    : results;

  return [...filtered].sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1;
    const idA = a.surveyId ?? a.clientSurveyId ?? "";
    const idB = b.surveyId ?? b.clientSurveyId ?? "";
    return idB.localeCompare(idA);
  });
}
