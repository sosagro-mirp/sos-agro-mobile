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
  isProvisional: boolean;
}

export async function extractFarmerLocally(s1SurveyId: string): Promise<LocalFarmerDraft | null> {
  const draft = await surveyDraftStore.loadDraft(s1SurveyId);
  if (!draft) return null;

  const instrument = await instrumentCacheStorage.get(draft.instrumentId);
  if (!instrument) return null;

  const flatQuestions = flattenSections(instrument.sections);

  let farmerName: string | null = null;
  let farmerLastName: string | null = null;
  let farmerDocumentId: string | null = null;
  let farmerPhone: string | null = null;

  for (const { question } of flatQuestions) {
    if (!question.systemField) continue;

    const answer = draft.answers[question.questionId];
    if (!answer) continue;

    const textOrNumeric =
      answer.textValue ?? (answer.numericValue != null ? String(answer.numericValue) : null);

    switch (question.systemField) {
      case 'farmer.name':
        farmerName = answer.textValue ?? null;
        break;
      case 'farmer.lastName':
        farmerLastName = answer.textValue ?? null;
        break;
      case 'farmer.documentId':
        farmerDocumentId = textOrNumeric;
        break;
      case 'farmer.phone':
        farmerPhone = textOrNumeric;
        break;
    }
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
    isProvisional: true,
  };
}
