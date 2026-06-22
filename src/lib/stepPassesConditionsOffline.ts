import type { CampaignStepRender } from '../types';

/**
 * Evaluates whether a campaign step applies offline given the session's known cropIds.
 *
 * - 'crop' conditions: evaluated against cropIds.
 * - 'question' conditions: always true offline (conservative — better to show an extra
 *   instrument than to skip one that should apply; the backend re-evaluates at sync time).
 * - Multiple conditions are combined with their logicalOperator (AND/OR).
 */
export function stepPassesConditionsOffline(
  step: CampaignStepRender,
  cropIds: string[],
): boolean {
  const conditions = (step.conditions ?? []).slice().sort((a, b) => a.order - b.order);
  if (conditions.length === 0) return true;

  let result = evalCondition(conditions[0], cropIds);

  for (let i = 1; i < conditions.length; i++) {
    const cond = conditions[i];
    const val = evalCondition(cond, cropIds);
    if (cond.logicalOperator === 'OR') {
      result = result || val;
    } else {
      result = result && val;
    }
  }

  return result;
}

function evalCondition(
  condition: CampaignStepRender['conditions'][number],
  cropIds: string[],
): boolean {
  if (condition.conditionType === 'crop') {
    const cropId = condition.conditionCrop?.cropId;
    return cropId ? cropIds.includes(cropId) : false;
  }
  // 'question' conditions cannot be evaluated offline — treat as true.
  return true;
}
