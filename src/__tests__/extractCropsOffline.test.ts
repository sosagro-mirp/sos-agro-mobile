/**
 * Unit tests for extractCropsOffline.
 *
 * All external collaborators (DB, instrument cache, campaign cache) are mocked.
 */

// ─── Mock declarations (hoisted before imports) ───────────────────────────────

jest.mock('drizzle-orm', () => ({
  eq: jest.fn(() => 'eq-expr'),
  and: jest.fn(() => 'and-expr'),
  inArray: jest.fn(() => 'inarray-expr'),
}));

jest.mock('../storage/db/schema', () => ({
  surveys: { id: 'surveys.id', instrumentId: 'surveys.instrumentId', campaignSessionId: 'surveys.campaignSessionId', status: 'surveys.status' },
  responses: { surveyId: 'responses.surveyId', questionId: 'responses.questionId', booleanValue: 'responses.booleanValue' },
}));

jest.mock('../storage/db/db', () => {
  const mockChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    get: jest.fn(),
    all: jest.fn(),
  };
  return {
    db: { select: jest.fn(() => mockChain) },
    __chain: mockChain,
  };
});

jest.mock('../storage/instrumentCache', () => ({
  instrumentCacheStorage: { get: jest.fn() },
}));

jest.mock('../storage/campaignCache', () => ({
  campaignCacheStorage: { get: jest.fn() },
}));

// ─── Import SUT and mocked modules ───────────────────────────────────────────

import { extractCropsOffline } from '../lib/extractCropsOffline';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { campaignCacheStorage } from '../storage/campaignCache';

// Access the db chain via the __chain export added by the mock factory
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __chain: dbChain } = require('../storage/db/db');
const mockGet = dbChain.get as jest.Mock;
const mockAll = dbChain.all as jest.Mock;

const mockInstrumentCacheGet = instrumentCacheStorage.get as jest.Mock;
const mockCampaignCacheGet = campaignCacheStorage.get as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CAMPAIGN_ID = 'campaign-1';
const SURVEY_ID = 'survey-1';
const INSTRUMENT_ID = 'inst-1';

function makeInstrumentWithFields(fields: Record<string, string>) {
  const questions = Object.entries(fields).map(([questionId, systemField]) => ({
    questionId,
    systemField,
  }));
  return {
    instrumentId: INSTRUMENT_ID,
    sections: [{ sectionId: 's1', questions }],
  };
}

function makeCampaign(crops: { cropId: string; name: string }[]) {
  return {
    campaignId: CAMPAIGN_ID,
    name: 'Test Campaign',
    steps: [],
    availableCrops: crops,
  };
}

// ─── Test isolation ───────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  dbChain.from.mockReturnThis();
  dbChain.where.mockReturnThis();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('extractCropsOffline', () => {
  it('returns [] when survey row is not found', async () => {
    mockGet.mockResolvedValue(undefined);

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([]);
    expect(mockInstrumentCacheGet).not.toHaveBeenCalled();
  });

  it('returns [] when instrument is not in cache', async () => {
    mockGet.mockResolvedValue({ instrumentId: INSTRUMENT_ID });
    mockInstrumentCacheGet.mockResolvedValue(null);

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([]);
    expect(mockCampaignCacheGet).not.toHaveBeenCalled();
  });

  it('returns [] when no responses have booleanValue = true', async () => {
    mockGet.mockResolvedValue({ instrumentId: INSTRUMENT_ID });
    mockInstrumentCacheGet.mockResolvedValue(makeInstrumentWithFields({ q1: 'crop.cafe' }));
    mockAll.mockResolvedValue([]);
    mockCampaignCacheGet.mockResolvedValue(makeCampaign([{ cropId: 'crop-1', name: 'Café' }]));

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([]);
  });

  it('returns the matching crop when a question with systemField crop.X is answered true', async () => {
    mockGet.mockResolvedValue({ instrumentId: INSTRUMENT_ID });
    mockInstrumentCacheGet.mockResolvedValue(
      makeInstrumentWithFields({ 'q-cafe': 'crop.cafe' })
    );
    mockAll.mockResolvedValue([{ questionId: 'q-cafe' }]);
    mockCampaignCacheGet.mockResolvedValue(
      makeCampaign([{ cropId: 'crop-1', name: 'Café' }])
    );

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([{ cropId: 'crop-1', name: 'Café' }]);
  });

  it('returns multiple crops when multiple crop questions are answered true', async () => {
    mockGet.mockResolvedValue({ instrumentId: INSTRUMENT_ID });
    mockInstrumentCacheGet.mockResolvedValue(
      makeInstrumentWithFields({ 'q-cafe': 'crop.cafe', 'q-cacao': 'crop.cacao' })
    );
    mockAll.mockResolvedValue([{ questionId: 'q-cafe' }, { questionId: 'q-cacao' }]);
    mockCampaignCacheGet.mockResolvedValue(
      makeCampaign([
        { cropId: 'crop-1', name: 'Café' },
        { cropId: 'crop-2', name: 'Cacao' },
      ])
    );

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([
      { cropId: 'crop-1', name: 'Café' },
      { cropId: 'crop-2', name: 'Cacao' },
    ]));
  });

  it('excludes questions whose systemField does not start with "crop."', async () => {
    mockGet.mockResolvedValue({ instrumentId: INSTRUMENT_ID });
    mockInstrumentCacheGet.mockResolvedValue(
      makeInstrumentWithFields({ 'q-other': 'farmer.name', 'q-cafe': 'crop.cafe' })
    );
    mockAll.mockResolvedValue([{ questionId: 'q-other' }, { questionId: 'q-cafe' }]);
    mockCampaignCacheGet.mockResolvedValue(
      makeCampaign([{ cropId: 'crop-1', name: 'Café' }])
    );

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([{ cropId: 'crop-1', name: 'Café' }]);
  });

  it('excludes crop names not found in availableCrops', async () => {
    mockGet.mockResolvedValue({ instrumentId: INSTRUMENT_ID });
    mockInstrumentCacheGet.mockResolvedValue(
      makeInstrumentWithFields({ 'q-cannabis': 'crop.cannabis' })
    );
    mockAll.mockResolvedValue([{ questionId: 'q-cannabis' }]);
    mockCampaignCacheGet.mockResolvedValue(
      makeCampaign([{ cropId: 'crop-1', name: 'Café' }])
    );

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([]);
  });

  it('returns [] when campaign is not in cache', async () => {
    mockGet.mockResolvedValue({ instrumentId: INSTRUMENT_ID });
    mockInstrumentCacheGet.mockResolvedValue(
      makeInstrumentWithFields({ 'q-cafe': 'crop.cafe' })
    );
    mockAll.mockResolvedValue([{ questionId: 'q-cafe' }]);
    mockCampaignCacheGet.mockResolvedValue(null);

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([]);
  });

  it('excludes questions with no systemField from crop resolution', async () => {
    mockGet.mockResolvedValue({ instrumentId: INSTRUMENT_ID });
    mockInstrumentCacheGet.mockResolvedValue({
      instrumentId: INSTRUMENT_ID,
      sections: [{ sectionId: 's1', questions: [{ questionId: 'q-no-field' }] }],
    });
    mockAll.mockResolvedValue([{ questionId: 'q-no-field' }]);
    mockCampaignCacheGet.mockResolvedValue(
      makeCampaign([{ cropId: 'crop-1', name: 'Café' }])
    );

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([]);
  });

  it('deduplicates crops when two questions resolve to the same cropId', async () => {
    mockGet.mockResolvedValue({ instrumentId: INSTRUMENT_ID });
    mockInstrumentCacheGet.mockResolvedValue(
      makeInstrumentWithFields({ 'q-cafe-1': 'crop.cafe', 'q-cafe-2': 'crop.cafe' })
    );
    mockAll.mockResolvedValue([{ questionId: 'q-cafe-1' }, { questionId: 'q-cafe-2' }]);
    mockCampaignCacheGet.mockResolvedValue(
      makeCampaign([{ cropId: 'crop-1', name: 'Café' }])
    );

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([{ cropId: 'crop-1', name: 'Café' }]);
  });
});
