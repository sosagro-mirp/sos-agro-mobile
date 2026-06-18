import { eq, and } from 'drizzle-orm';
import { db } from '../storage/db/db';
import { surveys } from '../storage/db/schema';
import { campaignCacheStorage } from '../storage/campaignCache';
import type { NextStepResponse } from '../types';

/**
 * Computes the next campaign step locally, without a backend call.
 * Used in offline mode after skipping a step.
 *
 * Ignores conditional steps (conditionQuestion) — if the active campaign
 * has conditional steps, the caller should fall back to /completed.
 */
export async function getNextStepOffline(
  campaignId: string,
  sessionId: string,
  currentStepOrder: number,
): Promise<NextStepResponse | null> {
  const campaign = await campaignCacheStorage.get(campaignId);
  if (!campaign) return null;

  const hasConditionalSteps = campaign.steps.some((s) => s.conditionQuestion !== null);
  if (hasConditionalSteps) return null;

  const sortedSteps = [...campaign.steps].sort((a, b) => a.order - b.order);

  const completedSurveys = await db
    .select({ instrumentId: surveys.instrumentId })
    .from(surveys)
    .where(
      and(
        eq(surveys.campaignSessionId, sessionId),
        // status 'completed' or 'synced' = step done or marked as skip
      )
    )
    .all();

  const completedInstrumentIds = new Set(completedSurveys.map((s) => s.instrumentId));

  const nextStep = sortedSteps.find(
    (step) =>
      step.order > currentStepOrder &&
      !completedInstrumentIds.has(step.instrument.instrumentId)
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
