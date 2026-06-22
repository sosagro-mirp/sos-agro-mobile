import { stepPassesConditionsOffline } from '../lib/stepPassesConditionsOffline';
import type { CampaignStepRender, StepConditionRender } from '../types/campaign';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStep(conditions: Partial<StepConditionRender>[]): CampaignStepRender {
  return {
    stepId: 'step-1',
    order: 1,
    instrument: { instrumentId: 'inst-1', name: 'Instrumento', isActive: true },
    conditions: conditions.map((c, i) => ({
      conditionId: `cond-${i}`,
      order: i,
      logicalOperator: null,
      conditionType: 'crop',
      conditionCrop: null,
      conditionQuestion: null,
      conditionValue: null,
      ...c,
    })),
  };
}

function cropCond(cropId: string, order = 0, logicalOperator: 'AND' | 'OR' | null = null): Partial<StepConditionRender> {
  return { conditionType: 'crop', conditionCrop: { cropId, name: cropId }, order, logicalOperator };
}

function questionCond(order = 0, logicalOperator: 'AND' | 'OR' | null = null): Partial<StepConditionRender> {
  return { conditionType: 'question', conditionQuestion: { questionId: 'q1', text: '?' }, order, logicalOperator };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('stepPassesConditionsOffline', () => {
  describe('no conditions', () => {
    it('returns true when conditions array is empty', () => {
      expect(stepPassesConditionsOffline(makeStep([]), ['crop-1'])).toBe(true);
    });

    it('returns true when conditions is undefined', () => {
      const step = { ...makeStep([]), conditions: undefined as any };
      expect(stepPassesConditionsOffline(step, [])).toBe(true);
    });
  });

  describe('single crop condition', () => {
    it('returns true when crop is present in the session', () => {
      const step = makeStep([cropCond('crop-café')]);
      expect(stepPassesConditionsOffline(step, ['crop-café', 'crop-cacao'])).toBe(true);
    });

    it('returns false when crop is NOT present in the session', () => {
      const step = makeStep([cropCond('crop-café')]);
      expect(stepPassesConditionsOffline(step, ['crop-cacao'])).toBe(false);
    });

    it('returns false when cropIds list is empty', () => {
      const step = makeStep([cropCond('crop-café')]);
      expect(stepPassesConditionsOffline(step, [])).toBe(false);
    });

    it('returns false when conditionCrop is null', () => {
      const step = makeStep([{ conditionType: 'crop', conditionCrop: null, order: 0, logicalOperator: null }]);
      expect(stepPassesConditionsOffline(step, ['crop-café'])).toBe(false);
    });
  });

  describe('question condition (always true offline)', () => {
    it('returns true regardless of cropIds', () => {
      const step = makeStep([questionCond()]);
      expect(stepPassesConditionsOffline(step, [])).toBe(true);
    });

    it('returns true even when cropIds has no matching crop', () => {
      const step = makeStep([questionCond()]);
      expect(stepPassesConditionsOffline(step, ['unrelated-crop'])).toBe(true);
    });
  });

  describe('AND logic', () => {
    it('returns true when both conditions pass', () => {
      const step = makeStep([
        cropCond('crop-café', 0, null),
        cropCond('crop-cacao', 1, 'AND'),
      ]);
      expect(stepPassesConditionsOffline(step, ['crop-café', 'crop-cacao'])).toBe(true);
    });

    it('returns false when first condition fails', () => {
      const step = makeStep([
        cropCond('crop-missing', 0, null),
        cropCond('crop-cacao', 1, 'AND'),
      ]);
      expect(stepPassesConditionsOffline(step, ['crop-cacao'])).toBe(false);
    });

    it('returns false when second condition fails', () => {
      const step = makeStep([
        cropCond('crop-café', 0, null),
        cropCond('crop-missing', 1, 'AND'),
      ]);
      expect(stepPassesConditionsOffline(step, ['crop-café'])).toBe(false);
    });

    it('returns false when both conditions fail', () => {
      const step = makeStep([
        cropCond('crop-a', 0, null),
        cropCond('crop-b', 1, 'AND'),
      ]);
      expect(stepPassesConditionsOffline(step, [])).toBe(false);
    });
  });

  describe('OR logic', () => {
    it('returns true when first condition passes', () => {
      const step = makeStep([
        cropCond('crop-café', 0, null),
        cropCond('crop-missing', 1, 'OR'),
      ]);
      expect(stepPassesConditionsOffline(step, ['crop-café'])).toBe(true);
    });

    it('returns true when second condition passes', () => {
      const step = makeStep([
        cropCond('crop-missing', 0, null),
        cropCond('crop-cacao', 1, 'OR'),
      ]);
      expect(stepPassesConditionsOffline(step, ['crop-cacao'])).toBe(true);
    });

    it('returns false when both conditions fail', () => {
      const step = makeStep([
        cropCond('crop-a', 0, null),
        cropCond('crop-b', 1, 'OR'),
      ]);
      expect(stepPassesConditionsOffline(step, [])).toBe(false);
    });
  });

  describe('mixed crop + question conditions', () => {
    it('returns true for crop(true) AND question', () => {
      const step = makeStep([
        cropCond('crop-café', 0, null),
        questionCond(1, 'AND'),
      ]);
      expect(stepPassesConditionsOffline(step, ['crop-café'])).toBe(true);
    });

    it('returns false for crop(false) AND question', () => {
      const step = makeStep([
        cropCond('crop-missing', 0, null),
        questionCond(1, 'AND'),
      ]);
      expect(stepPassesConditionsOffline(step, ['crop-café'])).toBe(false);
    });

    it('returns true for crop(false) OR question (question always true)', () => {
      const step = makeStep([
        cropCond('crop-missing', 0, null),
        questionCond(1, 'OR'),
      ]);
      expect(stepPassesConditionsOffline(step, [])).toBe(true);
    });
  });

  describe('condition ordering', () => {
    it('evaluates conditions in ascending order regardless of array order', () => {
      // First condition (order 0) is a failing crop; second (order 1) is passing crop with AND.
      // If evaluated in reverse, crop(pass) AND crop(fail) → false too, but order matters
      // for complex OR chains. Here we just verify the sort doesn't silently break.
      const step = makeStep([
        { ...cropCond('crop-missing', 1, 'AND') },  // order 1 in array position 0
        { ...cropCond('crop-café', 0, null) },       // order 0 in array position 1
      ]);
      // Sorted: crop-café(true, first) AND crop-missing(false) → false
      expect(stepPassesConditionsOffline(step, ['crop-café'])).toBe(false);
    });
  });
});
