import { eq, and } from 'drizzle-orm';
import { db } from '../storage/db/db';
import { surveys, responses } from '../storage/db/schema';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { campaignCacheStorage } from '../storage/campaignCache';
import { normalizeSearchText } from './optionSearch';
import type { CropSummary } from '../types';

/**
 * Replicates the backend's extractCrops logic locally for offline use.
 *
 * S2 questions about crops have systemField = 'crop.<name>' and are yes/no type.
 * A booleanValue = true means the farmer works that crop.
 * The name is resolved to a cropId using availableCrops from the campaign cache.
 */
export async function extractCropsOffline(
  s2SurveyId: string,
  campaignId: string,
): Promise<CropSummary[]> {
  const surveyRow = await db
    .select({ instrumentId: surveys.instrumentId })
    .from(surveys)
    .where(eq(surveys.id, s2SurveyId))
    .get();

  if (!surveyRow) return [];

  const instrument = await instrumentCacheStorage.get(surveyRow.instrumentId);
  if (!instrument) return [];

  const systemFieldByQuestionId = new Map<string, string>();
  // Spec 84 — instrumento de Registro (S_REG): cultivo principal como
  // pregunta de selección única, con `metadataId` = cropId (igual que el
  // backend en `surveys.service.ts`). Convive con las preguntas `crop.*`
  // (Sí/No) que ya usa S2/el taller.
  const optionMetadataById = new Map<string, string | null | undefined>();
  for (const section of instrument.sections) {
    for (const question of section.questions) {
      if (question.systemField) {
        systemFieldByQuestionId.set(question.questionId, question.systemField);
      }
      for (const option of question.options ?? []) {
        optionMetadataById.set(option.optionId, option.metadataId);
      }
    }
  }

  const affirmativeResponses = await db
    .select({ questionId: responses.questionId })
    .from(responses)
    .where(and(eq(responses.surveyId, s2SurveyId), eq(responses.booleanValue, true)))
    .all();

  const cropNames = affirmativeResponses
    .map((r) => systemFieldByQuestionId.get(r.questionId))
    .filter((sf): sf is string => !!sf && sf.startsWith('crop.'))
    .map((sf) => sf.split('.')[1]);

  // Spec 84 — segunda consulta, separada de la anterior: `farm.mainCrop` es
  // una respuesta de opción (optionId), no un booleano, así que no encaja en
  // el filtro `booleanValue = true` de arriba.
  const optionResponses = await db
    .select({ questionId: responses.questionId, optionId: responses.optionId })
    .from(responses)
    .where(eq(responses.surveyId, s2SurveyId))
    .all();

  const mainCropIds = optionResponses
    .filter((r) => r.optionId && systemFieldByQuestionId.get(r.questionId) === 'farm.mainCrop')
    .map((r) => optionMetadataById.get(r.optionId as string))
    .filter((id): id is string => !!id);

  if (cropNames.length === 0 && mainCropIds.length === 0) return [];

  const campaign = await campaignCacheStorage.get(campaignId);
  if (!campaign) return [];

  // The systemField key ('cafe', 'canamo', ...) is the ASCII/lowercase form of
  // the TypeOfCrop catalog name ('Café', 'Cáñamo', ...). Normalize both sides
  // instead of hardcoding a name map, so the catalog stays the single source
  // of truth and a new crop resolves without touching this file, as long as
  // it follows that convention.
  const cropsByName = cropNames
    .map((name) =>
      campaign.availableCrops.find(
        (c) => normalizeSearchText(c.name) === normalizeSearchText(name),
      ),
    )
    .filter((c): c is CropSummary => c !== undefined);

  const cropsByMainCrop = mainCropIds
    .map((cropId) => campaign.availableCrops.find((c) => c.cropId === cropId))
    .filter((c): c is CropSummary => c !== undefined);

  const uniqueCropsById = new Map(
    [...cropsByName, ...cropsByMainCrop].map((c) => [c.cropId, c]),
  );
  return Array.from(uniqueCropsById.values());
}
