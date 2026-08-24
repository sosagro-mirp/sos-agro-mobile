import { surveyDraftStore } from '../storage/surveyDraftStore';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { farmerCacheStorage } from '../storage/farmerCache';
import { flattenSections } from './flattenSections';
import { generateLocalId } from './generateLocalId';
import { isSameFarmerName } from './nameMatching';

export interface LocalFarmerDraft {
  farmerId: string;
  name: string;
  documentId: string | null;
  phone: string | null;
  farmName: string | null;
  isProvisional: boolean;
  // Spec 68 — presente cuando el documentId coincide con una entrada de
  // `farmerCache` cuyo nombre no corresponde al recién digitado. El
  // orquestador debe mostrar el modal de colisión y dejar que el
  // encuestador decida antes de continuar a S1b.
  collision?: {
    documentId: string;
    existingFarmerId: string;
    existingName: string;
    submittedName: string;
  };
}

export async function extractFarmerLocally(s1SurveyId: string): Promise<LocalFarmerDraft | null> {
  const draft = await surveyDraftStore.loadDraft(s1SurveyId);
  if (!draft) return null;

  const instrument = await instrumentCacheStorage.get(draft.instrumentId);
  if (!instrument) return null;

  const flatQuestions = flattenSections(instrument.sections);

  let respondentName: string | null = null;
  let respondentDocumentId: string | null = null;
  let respondentPhone: string | null = null;
  let producerName: string | null = null;
  let producerDocumentId: string | null = null;
  let producerPhone: string | null = null;
  let isRespondent: boolean | null = null;
  let farmName: string | null = null;

  for (const { question } of flatQuestions) {
    if (!question.systemField) continue;

    const answer = draft.answers[question.questionId];
    if (!answer) continue;

    const textOrNumeric =
      answer.textValue ?? (answer.numericValue != null ? String(answer.numericValue) : null);

    switch (question.systemField) {
      case 'farmer.name':
        respondentName = answer.textValue ?? null;
        break;
      case 'farmer.documentId':
        respondentDocumentId = textOrNumeric;
        break;
      case 'farmer.phone':
        respondentPhone = textOrNumeric;
        break;
      case 'farmer.isRespondent':
        isRespondent = answer.booleanValue ?? null;
        break;
      case 'farmer.producerName':
        producerName = answer.textValue ?? null;
        break;
      case 'farmer.producerDocumentId':
        producerDocumentId = textOrNumeric;
        break;
      case 'farmer.producerPhone':
        producerPhone = textOrNumeric;
        break;
      case 'farm.name':
        farmName = answer.textValue ?? null;
        break;
    }
  }

  const respondentIsProducer = isRespondent !== false;

  let farmerName: string | null;
  let farmerDocumentId: string | null;
  let farmerPhone: string | null;

  if (respondentIsProducer) {
    farmerName = respondentName;
    farmerDocumentId = respondentDocumentId;
    farmerPhone = respondentPhone;
  } else {
    farmerName = producerName || respondentName;
    farmerDocumentId = producerDocumentId || respondentDocumentId;
    farmerPhone = producerPhone;
  }

  if (!farmerName) return null;

  if (farmerDocumentId) {
    const cached = await farmerCacheStorage.getByDocumentId(farmerDocumentId);
    if (cached) {
      if (isSameFarmerName(cached.name, farmerName)) {
        return {
          farmerId: cached.farmerId,
          name: cached.name,
          documentId: cached.documentId ?? null,
          phone: cached.phone ?? null,
          farmName,
          isProvisional: false,
        };
      }

      // Spec 68, Fase 4 — colisión detectada contra la caché local: nunca
      // devolver el nombre cacheado en lugar del recién digitado (el bug
      // original, un nivel más arriba que el backend). Se genera un id
      // provisional nuevo, igual que el camino "sin caché", y se adjunta
      // `collision` para que el orquestador muestre el aviso antes de
      // continuar a S1b — ver criterios 10 y 11 del spec.
      return {
        farmerId: generateLocalId('farmer'),
        name: farmerName,
        documentId: farmerDocumentId,
        phone: farmerPhone,
        farmName,
        isProvisional: true,
        collision: {
          documentId: farmerDocumentId,
          existingFarmerId: cached.farmerId,
          existingName: cached.name,
          submittedName: farmerName,
        },
      };
    }
  }

  return {
    farmerId: generateLocalId('farmer'),
    name: farmerName,
    documentId: farmerDocumentId,
    phone: farmerPhone,
    farmName,
    isProvisional: true,
  };
}
