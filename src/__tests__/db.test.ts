/**
 * Schema structure tests — no live database required.
 *
 * These tests import the Drizzle schema and verify that expected columns
 * are defined on each table. They guard against accidental column renames
 * or table removals.
 */

import {
  surveys,
  responses,
  syncQueue,
  instrumentCache,
  campaignCache,
} from '../storage/db/schema';

// Helper: extract column names from a Drizzle SQLite table
function columnNames(table: Record<string, unknown>): string[] {
  // Drizzle tables expose columns through the table's own enumerable keys
  // excluding internal symbols and builder methods.
  return Object.keys(table).filter(
    (key) =>
      !key.startsWith('_') &&
      !key.startsWith('$') &&
      typeof (table[key] as Record<string, unknown>)?.name === 'string',
  );
}

// ─── surveys ─────────────────────────────────────────────────────────────────

describe('surveys table', () => {
  it('exports a Drizzle table object', () => {
    expect(surveys).toBeDefined();
  });

  it('has the expected column names', () => {
    expect(surveys.id).toBeDefined();
    expect(surveys.campaignSessionId).toBeDefined();
    expect(surveys.instrumentId).toBeDefined();
    expect(surveys.status).toBeDefined();
    expect(surveys.createdAt).toBeDefined();
    expect(surveys.updatedAt).toBeDefined();
  });

  it('maps "id" to the "id" DB column', () => {
    expect((surveys.id as unknown as { name: string }).name).toBe('id');
  });

  it('maps "campaignSessionId" to the "campaign_session_id" DB column', () => {
    expect((surveys.campaignSessionId as unknown as { name: string }).name).toBe(
      'campaign_session_id',
    );
  });

  it('maps "instrumentId" to the "instrument_id" DB column', () => {
    expect((surveys.instrumentId as unknown as { name: string }).name).toBe('instrument_id');
  });

  it('maps "createdAt" to the "created_at" DB column', () => {
    expect((surveys.createdAt as unknown as { name: string }).name).toBe('created_at');
  });

  it('maps "updatedAt" to the "updated_at" DB column', () => {
    expect((surveys.updatedAt as unknown as { name: string }).name).toBe('updated_at');
  });
});

// ─── responses ────────────────────────────────────────────────────────────────

describe('responses table', () => {
  it('exports a Drizzle table object', () => {
    expect(responses).toBeDefined();
  });

  it('has the expected column names', () => {
    expect(responses.id).toBeDefined();
    expect(responses.surveyId).toBeDefined();
    expect(responses.questionId).toBeDefined();
    expect(responses.optionId).toBeDefined();
    expect(responses.optionIds).toBeDefined();
    expect(responses.textValue).toBeDefined();
    expect(responses.numericValue).toBeDefined();
    expect(responses.booleanValue).toBeDefined();
    expect(responses.otherText).toBeDefined();
  });

  it('maps "surveyId" to "survey_id" DB column', () => {
    expect((responses.surveyId as unknown as { name: string }).name).toBe('survey_id');
  });

  it('maps "questionId" to "question_id" DB column', () => {
    expect((responses.questionId as unknown as { name: string }).name).toBe('question_id');
  });

  it('maps "optionIds" to "option_ids" DB column (stores JSON)', () => {
    expect((responses.optionIds as unknown as { name: string }).name).toBe('option_ids');
  });

  it('maps "textValue" to "text_value" DB column', () => {
    expect((responses.textValue as unknown as { name: string }).name).toBe('text_value');
  });

  it('maps "numericValue" to "numeric_value" DB column', () => {
    expect((responses.numericValue as unknown as { name: string }).name).toBe('numeric_value');
  });

  it('maps "booleanValue" to "boolean_value" DB column', () => {
    expect((responses.booleanValue as unknown as { name: string }).name).toBe('boolean_value');
  });

  it('maps "otherText" to "other_text" DB column', () => {
    expect((responses.otherText as unknown as { name: string }).name).toBe('other_text');
  });
});

// ─── syncQueue ────────────────────────────────────────────────────────────────

describe('syncQueue table', () => {
  it('exports a Drizzle table object', () => {
    expect(syncQueue).toBeDefined();
  });

  it('has the expected column names', () => {
    expect(syncQueue.id).toBeDefined();
    expect(syncQueue.surveyId).toBeDefined();
    expect(syncQueue.campaignSessionId).toBeDefined();
    expect(syncQueue.stepOrder).toBeDefined();
    expect(syncQueue.attempts).toBeDefined();
    expect(syncQueue.status).toBeDefined();
    expect(syncQueue.createdAt).toBeDefined();
  });

  it('maps "surveyId" to "survey_id" DB column', () => {
    expect((syncQueue.surveyId as unknown as { name: string }).name).toBe('survey_id');
  });

  it('maps "campaignSessionId" to "campaign_session_id" DB column', () => {
    expect((syncQueue.campaignSessionId as unknown as { name: string }).name).toBe(
      'campaign_session_id',
    );
  });

  it('maps "stepOrder" to "step_order" DB column', () => {
    expect((syncQueue.stepOrder as unknown as { name: string }).name).toBe('step_order');
  });

  it('maps "createdAt" to "created_at" DB column', () => {
    expect((syncQueue.createdAt as unknown as { name: string }).name).toBe('created_at');
  });
});

// ─── instrumentCache ─────────────────────────────────────────────────────────

describe('instrumentCache table', () => {
  it('exists and has id, data, cachedAt columns', () => {
    expect(instrumentCache).toBeDefined();
    expect(instrumentCache.id).toBeDefined();
    expect(instrumentCache.data).toBeDefined();
    expect(instrumentCache.cachedAt).toBeDefined();
  });

  it('maps "cachedAt" to "cached_at" DB column', () => {
    expect((instrumentCache.cachedAt as unknown as { name: string }).name).toBe('cached_at');
  });
});

// ─── campaignCache ────────────────────────────────────────────────────────────

describe('campaignCache table', () => {
  it('exists and has id, data, cachedAt columns', () => {
    expect(campaignCache).toBeDefined();
    expect(campaignCache.id).toBeDefined();
    expect(campaignCache.data).toBeDefined();
    expect(campaignCache.cachedAt).toBeDefined();
  });
});
