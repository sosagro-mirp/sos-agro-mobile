import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../storage/db/db';
import { surveys } from '../storage/db/schema';
import { campaignCacheStorage } from '../storage/campaignCache';
import { sessionCropsStorage } from '../storage/sessionCropsStorage';
import { stepPassesConditionsOffline } from './stepPassesConditionsOffline';
import type { NextStepResponse } from '../types';

/**
 * Computes the next campaign step locally, without a backend call.
 * Used in offline mode to navigate between steps and to check for duplicates.
 *
 * Crop conditions are evaluated against cropIds stored in sessionCropsStorage.
 * Question conditions cannot be evaluated offline and are treated as true
 * (conservative: better to show an extra instrument than to skip one that applies;
 * the backend re-evaluates at sync time).
 */
export async function getNextStepOffline(
  campaignId: string,
  sessionId: string,
  currentStepOrder: number,
): Promise<NextStepResponse | null> {
  const campaign = await campaignCacheStorage.get(campaignId);
  if (!campaign) return null;

  const sortedSteps = [...campaign.steps].sort((a, b) => a.order - b.order);

  const [completedSurveys, sessionCrops] = await Promise.all([
    db
      .select({ instrumentId: surveys.instrumentId })
      .from(surveys)
      .where(
        and(
          eq(surveys.campaignSessionId, sessionId),
          inArray(surveys.status, ['completed', 'synced']),
        )
      )
      .all(),
    sessionCropsStorage.get(sessionId),
  ]);

  const completedInstrumentIds = new Set(completedSurveys.map((s) => s.instrumentId));
  const cropIds = sessionCrops.map((c) => c.cropId);

  const nextStep = sortedSteps.find(
    (step) =>
      step.order > currentStepOrder &&
      !completedInstrumentIds.has(step.instrument.instrumentId) &&
      stepPassesConditionsOffline(step, cropIds)
  );

  if (!nextStep) {
    return {};
  }

  return {
    stepId: nextStep.stepId,
    order: nextStep.order,
    instrument: nextStep.instrument,
    totalSteps: sortedSteps.length,
    completedCount: completedInstrumentIds.size,
  };
}
