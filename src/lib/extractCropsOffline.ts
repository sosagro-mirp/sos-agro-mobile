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
  for (const section of instrument.sections) {
    for (const question of section.questions) {
      if (question.systemField) {
        systemFieldByQuestionId.set(question.questionId, question.systemField);
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

  if (cropNames.length === 0) return [];

  const campaign = await campaignCacheStorage.get(campaignId);
  if (!campaign) return [];

  // The systemField key ('cafe', 'canamo', ...) is the ASCII/lowercase form of
  // the TypeOfCrop catalog name ('Café', 'Cáñamo', ...). Normalize both sides
  // instead of hardcoding a name map, so the catalog stays the single source
  // of truth and a new crop resolves without touching this file, as long as
  // it follows that convention.
  const resolvedCrops = cropNames
    .map((name) =>
      campaign.availableCrops.find(
        (c) => normalizeSearchText(c.name) === normalizeSearchText(name),
      ),
    )
    .filter((c): c is CropSummary => c !== undefined);

  const uniqueCropsById = new Map(resolvedCrops.map((c) => [c.cropId, c]));
  return Array.from(uniqueCropsById.values());
}
