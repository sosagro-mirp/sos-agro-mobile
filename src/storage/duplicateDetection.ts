import { eq, and } from 'drizzle-orm';
import { db } from './db/db';
import { surveys, responses } from './db/schema';
import { httpClient, NetworkError } from '../api/httpClient';
import { endpoints } from '../api/endpoints';

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  localSurveyId?: string;
}

export async function checkDuplicateLocal(
  instrumentId: string,
  farmerId: string,
): Promise<DuplicateCheckResult> {
  const matchingSurveys = await db
    .select({ id: surveys.id })
    .from(surveys)
    .where(
      and(
        eq(surveys.instrumentId, instrumentId),
        eq(surveys.farmerId, farmerId),
      )
    )
    .all();

  if (matchingSurveys.length === 0) {
    return { hasDuplicate: false };
  }

  for (const survey of matchingSurveys) {
    const responseCount = await db
      .select({ id: responses.id })
      .from(responses)
      .where(eq(responses.surveyId, survey.id))
      .limit(1)
      .all();

    if (responseCount.length > 0) {
      return { hasDuplicate: true, localSurveyId: survey.id };
    }
  }

  return { hasDuplicate: false };
}

export async function checkDuplicate(params: {
  farmerId: string;
  instrumentId: string;
  campaignId: string;
  isOnline: boolean;
}): Promise<DuplicateCheckResult> {
  const { farmerId, instrumentId, campaignId, isOnline } = params;

  if (isOnline) {
    try {
      const result = await httpClient.get<{ hasDuplicate: boolean; surveyId?: string }>(
        `${endpoints.surveyCheckDuplicate}?farmerId=${farmerId}&instrumentId=${instrumentId}&campaignId=${campaignId}`
      );
      return {
        hasDuplicate: result.hasDuplicate,
        localSurveyId: result.surveyId,
      };
    } catch (err) {
      if (err instanceof NetworkError) {
        return checkDuplicateLocal(instrumentId, farmerId);
      }
      throw err;
    }
  }

  return checkDuplicateLocal(instrumentId, farmerId);
}
