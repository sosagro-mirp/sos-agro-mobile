import { surveyDraftStore } from '../storage/surveyDraftStore';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { farmerCacheStorage } from '../storage/farmerCache';
import { flattenSections } from './flattenSections';
import { generateLocalId } from './generateLocalId';

export interface LocalFarmerDraft {
  farmerId: string;
  name: string;
  lastName: string | null;
  documentId: string | null;
  phone: string | null;
  farmName: string | null;
  isProvisional: boolean;
}

export async function extractFarmerLocally(s1SurveyId: string): Promise<LocalFarmerDraft | null> {
  const draft = await surveyDraftStore.loadDraft(s1SurveyId);
  if (!draft) return null;

  const instrument = await instrumentCacheStorage.get(draft.instrumentId);
  if (!instrument) return null;

  const flatQuestions = flattenSections(instrument.sections);

  let respondentName: string | null = null;
  let respondentLastName: string | null = null;
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
      case 'farmer.lastName':
        respondentLastName = answer.textValue ?? null;
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
  let farmerLastName: string | null;
  let farmerDocumentId: string | null;
  let farmerPhone: string | null;

  if (respondentIsProducer) {
    farmerName = respondentName;
    farmerLastName = respondentLastName;
    farmerDocumentId = respondentDocumentId;
    farmerPhone = respondentPhone;
  } else {
    farmerName = producerName || respondentName;
    farmerLastName = null;
    farmerDocumentId = producerDocumentId || respondentDocumentId;
    farmerPhone = producerPhone;
  }

  if (!farmerName) return null;

  if (farmerDocumentId) {
    const cached = await farmerCacheStorage.getByDocumentId(farmerDocumentId);
    if (cached) {
      return {
        farmerId: cached.farmerId,
        name: cached.name,
        lastName: cached.lastName ?? null,
        documentId: cached.documentId ?? null,
        phone: cached.phone ?? null,
        farmName,
        isProvisional: false,
      };
    }
  }

  return {
    farmerId: generateLocalId('farmer'),
    name: farmerName,
    lastName: farmerLastName,
    documentId: farmerDocumentId,
    phone: farmerPhone,
    farmName,
    isProvisional: true,
  };
}
