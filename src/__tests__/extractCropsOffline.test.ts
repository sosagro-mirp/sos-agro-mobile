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

// ─── Spec 84 — farm.mainCrop (opción con metadataId = cropId) ────────────────
//
// `extractCropsOffline` hace dos lecturas de `responses` con `.all()`:
//   1) respuestas con booleanValue = true (preguntas `crop.*` Sí/No),
//   2) todas las respuestas de la encuesta (para `farm.mainCrop` por optionId).
// Como el mock de db comparte la cadena, se encadenan con mockResolvedValueOnce
// en ese orden, simulando lo que devolvería SQLite para cada filtro.

const MAIN_CROP_QUESTION_ID = 'q-main-crop';

function makeRegistroInstrument(opts: {
  cropFields?: Record<string, string>;
  mainCropOptions?: { optionId: string; metadataId?: string | null }[];
  extraQuestions?: {
    questionId: string;
    systemField?: string;
    options?: { optionId: string; metadataId?: string | null }[];
  }[];
}) {
  const cropQuestions = Object.entries(opts.cropFields ?? {}).map(([questionId, systemField]) => ({
    questionId,
    systemField,
  }));
  const mainCropQuestion = opts.mainCropOptions
    ? [
        {
          questionId: MAIN_CROP_QUESTION_ID,
          systemField: 'farm.mainCrop',
          options: opts.mainCropOptions.map((o) => ({ text: o.optionId, value: null, ...o })),
        },
      ]
    : [];
  return {
    instrumentId: INSTRUMENT_ID,
    sections: [
      {
        sectionId: 's1',
        questions: [...cropQuestions, ...mainCropQuestion, ...(opts.extraQuestions ?? [])],
      },
    ],
  };
}

const CAFE = { cropId: 'crop-cafe', name: 'Café' };
const CACAO = { cropId: 'crop-cacao', name: 'Cacao' };

describe('extractCropsOffline — spec 84, farm.mainCrop', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue({ instrumentId: INSTRUMENT_ID });
  });

  it('resuelve el cultivo cuando la opción elegida en farm.mainCrop tiene metadataId = cropId', async () => {
    mockInstrumentCacheGet.mockResolvedValue(
      makeRegistroInstrument({
        mainCropOptions: [
          { optionId: 'opt-cafe', metadataId: CAFE.cropId },
          { optionId: 'opt-cacao', metadataId: CACAO.cropId },
        ],
      }),
    );
    mockAll
      .mockResolvedValueOnce([]) // sin respuestas booleanas
      .mockResolvedValueOnce([{ questionId: MAIN_CROP_QUESTION_ID, optionId: 'opt-cacao' }]);
    mockCampaignCacheGet.mockResolvedValue(makeCampaign([CAFE, CACAO]));

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([CACAO]);
  });

  it('sigue resolviendo las preguntas crop.* Sí/No cuando el instrumento también trae farm.mainCrop sin responder', async () => {
    mockInstrumentCacheGet.mockResolvedValue(
      makeRegistroInstrument({
        cropFields: { 'q-cafe': 'crop.cafe' },
        mainCropOptions: [{ optionId: 'opt-cacao', metadataId: CACAO.cropId }],
      }),
    );
    mockAll
      .mockResolvedValueOnce([{ questionId: 'q-cafe' }])
      .mockResolvedValueOnce([{ questionId: 'q-cafe', optionId: null }]);
    mockCampaignCacheGet.mockResolvedValue(makeCampaign([CAFE, CACAO]));

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([CAFE]);
  });

  it('combina crop.* y farm.mainCrop cuando apuntan a cultivos distintos', async () => {
    mockInstrumentCacheGet.mockResolvedValue(
      makeRegistroInstrument({
        cropFields: { 'q-cafe': 'crop.cafe' },
        mainCropOptions: [{ optionId: 'opt-cacao', metadataId: CACAO.cropId }],
      }),
    );
    mockAll
      .mockResolvedValueOnce([{ questionId: 'q-cafe' }])
      .mockResolvedValueOnce([
        { questionId: 'q-cafe', optionId: null },
        { questionId: MAIN_CROP_QUESTION_ID, optionId: 'opt-cacao' },
      ]);
    mockCampaignCacheGet.mockResolvedValue(makeCampaign([CAFE, CACAO]));

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([CAFE, CACAO]));
  });

  it('no duplica el cultivo cuando crop.* y farm.mainCrop resuelven al mismo cropId', async () => {
    mockInstrumentCacheGet.mockResolvedValue(
      makeRegistroInstrument({
        cropFields: { 'q-cafe': 'crop.cafe' },
        mainCropOptions: [{ optionId: 'opt-cafe', metadataId: CAFE.cropId }],
      }),
    );
    mockAll
      .mockResolvedValueOnce([{ questionId: 'q-cafe' }])
      .mockResolvedValueOnce([
        { questionId: 'q-cafe', optionId: null },
        { questionId: MAIN_CROP_QUESTION_ID, optionId: 'opt-cafe' },
      ]);
    mockCampaignCacheGet.mockResolvedValue(makeCampaign([CAFE, CACAO]));

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([CAFE]);
  });

  it('resuelve varias respuestas de opción de farm.mainCrop y las deduplica', async () => {
    mockInstrumentCacheGet.mockResolvedValue(
      makeRegistroInstrument({
        mainCropOptions: [
          { optionId: 'opt-cafe', metadataId: CAFE.cropId },
          { optionId: 'opt-cacao', metadataId: CACAO.cropId },
        ],
      }),
    );
    mockAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { questionId: MAIN_CROP_QUESTION_ID, optionId: 'opt-cafe' },
        { questionId: MAIN_CROP_QUESTION_ID, optionId: 'opt-cacao' },
        { questionId: MAIN_CROP_QUESTION_ID, optionId: 'opt-cafe' },
      ]);
    mockCampaignCacheGet.mockResolvedValue(makeCampaign([CAFE, CACAO]));

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([CAFE, CACAO]));
  });

  it('devuelve [] y no consulta la campaña cuando la opción elegida no tiene metadataId', async () => {
    mockInstrumentCacheGet.mockResolvedValue(
      makeRegistroInstrument({
        mainCropOptions: [{ optionId: 'opt-otro', metadataId: null }],
      }),
    );
    mockAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ questionId: MAIN_CROP_QUESTION_ID, optionId: 'opt-otro' }]);

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([]);
    expect(mockCampaignCacheGet).not.toHaveBeenCalled();
  });

  it('excluye el cropId de farm.mainCrop que no está en availableCrops de la campaña', async () => {
    mockInstrumentCacheGet.mockResolvedValue(
      makeRegistroInstrument({
        mainCropOptions: [{ optionId: 'opt-canamo', metadataId: 'crop-canamo' }],
      }),
    );
    mockAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ questionId: MAIN_CROP_QUESTION_ID, optionId: 'opt-canamo' }]);
    mockCampaignCacheGet.mockResolvedValue(makeCampaign([CAFE]));

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([]);
  });

  it('ignora opciones con metadataId de preguntas cuyo systemField no es farm.mainCrop', async () => {
    mockInstrumentCacheGet.mockResolvedValue(
      makeRegistroInstrument({
        extraQuestions: [
          {
            questionId: 'q-departamento',
            systemField: 'farm.department',
            options: [{ optionId: 'opt-dep', metadataId: CAFE.cropId }],
          },
        ],
      }),
    );
    mockAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ questionId: 'q-departamento', optionId: 'opt-dep' }]);
    mockCampaignCacheGet.mockResolvedValue(makeCampaign([CAFE]));

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([]);
    expect(mockCampaignCacheGet).not.toHaveBeenCalled();
  });
});
