import type { RemoteSurveyResponseRow } from "../types";

export interface RemoteAnswerRow {
  questionId: string;
  questionText: string;
  displayValue: string;
}

export interface RemoteSection {
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  rows: RemoteAnswerRow[];
}

const MEDIA_LABELS: Partial<Record<string, string>> = {
  image: "Foto capturada",
  voice_recording: "Audio grabado",
  document: "Documento adjunto",
  video: "Video grabado",
};

const MEDIA_EMPTY_LABEL = "Sin evidencia capturada";
const NO_ANSWER_LABEL = "Sin respuesta";

function isMediaQuestion(typeName: string): boolean {
  return typeName in MEDIA_LABELS;
}

function formatValue(row: RemoteSurveyResponseRow, mergedOptionTexts: string[]): string {
  if (isMediaQuestion(row.questionType)) {
    return row.hasAttachment ? (MEDIA_LABELS[row.questionType] ?? MEDIA_EMPTY_LABEL) : MEDIA_EMPTY_LABEL;
  }

  if (mergedOptionTexts.length > 0) {
    // El servidor no conserva el prefijo "Otro:"; el texto ya viene tal cual
    // lo escribió el encuestador en `optionText` (spec 92, D2/Alcance 5).
    return mergedOptionTexts.join(", ");
  }

  if (row.textValue != null && row.textValue !== "") return row.textValue;
  if (row.numericValue != null) return String(row.numericValue);
  if (row.booleanValue != null) return row.booleanValue ? "Sí" : "No";
  return NO_ANSWER_LABEL;
}

/**
 * Agrupa las filas de `GET /api/surveys/:id/responses` (vistas de solo
 * lectura, ya en la lista blanca cuando el requester es POLLSTER) por
 * sección, en el orden del instrumento, y fusiona las filas de selección
 * múltiple —una por opción marcada— en una sola fila por pregunta
 * (spec 92, Alcance punto 5).
 */
export function groupRemoteResponses(rows: RemoteSurveyResponseRow[]): RemoteSection[] {
  const rowsByQuestion = new Map<string, RemoteSurveyResponseRow[]>();
  const questionOrder: string[] = [];

  for (const row of rows) {
    if (!rowsByQuestion.has(row.questionId)) {
      rowsByQuestion.set(row.questionId, []);
      questionOrder.push(row.questionId);
    }
    rowsByQuestion.get(row.questionId)!.push(row);
  }

  const sections = new Map<string, RemoteSection>();

  for (const questionId of questionOrder) {
    const group = rowsByQuestion.get(questionId)!;
    const first = group[0];
    const optionTexts = group
      .map((row) => row.optionText)
      .filter((text): text is string => Boolean(text));

    if (!sections.has(first.sectionId)) {
      sections.set(first.sectionId, {
        sectionId: first.sectionId,
        sectionTitle: first.sectionTitle,
        sectionOrder: first.sectionOrder,
        rows: [],
      });
    }

    sections.get(first.sectionId)!.rows.push({
      questionId,
      questionText: first.questionText,
      displayValue: formatValue(first, optionTexts),
    });
  }

  return [...sections.values()].sort((a, b) => a.sectionOrder - b.sectionOrder);
}
