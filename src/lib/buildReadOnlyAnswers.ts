import type { InstrumentDraftAnswer, InstrumentQuestion, InstrumentSection } from "../types";
import { flattenSections } from "./flattenSections";
import { isQuestionVisible } from "./isQuestionVisible";

export interface ReadOnlyAnswerRow {
  questionId: string;
  questionText: string;
  displayValue: string;
}

export interface ReadOnlySection {
  sectionId: string;
  sectionName: string;
  sectionOrder: number;
  rows: ReadOnlyAnswerRow[];
}

const MEDIA_LABELS: Partial<Record<string, string>> = {
  image: "Foto capturada",
  voice_recording: "Audio grabado",
  document: "Documento adjunto",
  video: "Video grabado",
};

const MEDIA_EMPTY_LABEL = "Sin evidencia capturada";
const NO_ANSWER_LABEL = "Sin respuesta";
export const MISSING_OPTION_LABEL = "Opción no disponible";

function isMediaQuestion(typeName: string): boolean {
  return typeName in MEDIA_LABELS;
}

function optionLabel(question: InstrumentQuestion, optionId: string, otherText: string | undefined): string {
  const option = question.options.find((candidate) => candidate.optionId === optionId);
  if (!option) {
    // Antes del spec 89, al sincronizar se sustituía «Otro» por una opción nueva
    // con el texto escrito, que no está en el instrumento en caché. Esos
    // borradores ya sincronizados siguen en los dispositivos: si conservan el
    // texto, se muestra como «Otro».
    return otherText?.trim() ? `Otro: ${otherText.trim()}` : MISSING_OPTION_LABEL;
  }
  if (option.isOther) return `Otro: ${otherText ?? ""}`;
  return option.text;
}

function formatAnswer(question: InstrumentQuestion, answer: InstrumentDraftAnswer | undefined): string {
  const typeName = question.type.name;

  if (isMediaQuestion(typeName)) {
    return answer?.mediaLocalPath ? (MEDIA_LABELS[typeName] ?? MEDIA_EMPTY_LABEL) : MEDIA_EMPTY_LABEL;
  }

  if (!answer) return NO_ANSWER_LABEL;

  if (typeName === "multiple_choice") {
    // El texto de «Otro» pertenece a UNA opción: la primera que no está en el
    // instrumento. Las demás desconocidas (p. ej. archivadas) no lo heredan.
    let otherTextAvailable = answer.otherText;
    const labels = (answer.optionIds ?? []).map((optionId) => {
      const known = question.options.some((candidate) => candidate.optionId === optionId);
      if (known) return optionLabel(question, optionId, answer.otherText);
      const label = optionLabel(question, optionId, otherTextAvailable);
      otherTextAvailable = undefined;
      return label;
    });
    return labels.length > 0 ? labels.join(", ") : NO_ANSWER_LABEL;
  }

  if (typeName === "numeric_with_unit") {
    const unit = answer.optionId !== undefined ? optionLabel(question, answer.optionId, answer.otherText) : null;
    if (answer.numericValue != null && unit) return `${answer.numericValue} ${unit}`;
    if (answer.numericValue != null) return String(answer.numericValue);
    return unit ?? NO_ANSWER_LABEL;
  }

  if (answer.optionId !== undefined) {
    return optionLabel(question, answer.optionId, answer.otherText);
  }

  if (typeName === "numeric") {
    return answer.numericValue != null ? String(answer.numericValue) : NO_ANSWER_LABEL;
  }

  if (answer.booleanValue !== undefined) {
    return answer.booleanValue ? "Sí" : "No";
  }

  return answer.textValue?.trim() ? answer.textValue : NO_ANSWER_LABEL;
}

/**
 * Arma las respuestas de solo lectura de una encuesta local a partir del
 * instrumento en caché. Agrupa por sección en el orden del instrumento,
 * oculta las preguntas que no aplicaron (`isQuestionVisible`) y resuelve
 * cada valor a su texto de presentación (spec 92, Alcance punto 5).
 *
 * Si no hay instrumento en caché o no hay respuestas locales, es
 * responsabilidad de quien llama (la pantalla de detalle, Fase 4) mostrar
 * "El detalle de esta encuesta no está disponible sin conexión" en vez de
 * invocar esta función.
 */
export function buildReadOnlyAnswers(
  sections: InstrumentSection[],
  answers: Record<string, InstrumentDraftAnswer>,
): ReadOnlySection[] {
  const bySection = new Map<string, ReadOnlySection>();

  for (const { sectionId, sectionName, sectionOrder, question } of flattenSections(sections)) {
    if (!isQuestionVisible(question, answers)) continue;

    if (!bySection.has(sectionId)) {
      bySection.set(sectionId, { sectionId, sectionName, sectionOrder, rows: [] });
    }

    bySection.get(sectionId)!.rows.push({
      questionId: question.questionId,
      questionText: question.text,
      displayValue: formatAnswer(question, answers[question.questionId]),
    });
  }

  return [...bySection.values()].sort((a, b) => a.sectionOrder - b.sectionOrder);
}
