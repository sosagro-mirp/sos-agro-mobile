/**
 * Spec 49 — Bug A: resolución de cultivos offline.
 *
 * Cubre los criterios de aceptación 1, 2 y 3 de
 * `spec/49_correccion_identidad_offline_agricultor_cultivos.md`.
 *
 * A diferencia de `extractCropsOffline.test.ts`, estos casos usan los valores
 * REALES de producción y por eso arrancan EN ROJO:
 *
 *   systemField (seed del instrumento)  →  nombre en catálogo TypeOfCrop
 *   ─────────────────────────────────────────────────────────────────────
 *   crop.cacao                          →  Cacao
 *   crop.cafe                           →  Café
 *   crop.cannabis                       →  Cannabis
 *   crop.canamo                         →  Cáñamo
 *
 * Fuentes: backend/src/database/seeds/instrumento-s2-cultivos-identificacion-de-cadenas.seed.ts
 *          backend/src/database/seeds/types-of-crops.seed.ts
 *
 * `extractCropsOffline` compara la clave cruda del systemField contra el nombre
 * del catálogo con `===`, así que hoy los cuatro cultivos fallan (no solo los
 * acentuados: 'cacao' !== 'Cacao' por la mayúscula).
 */

// ─── Mock declarations (hoisted before imports) ───────────────────────────────

jest.mock('drizzle-orm', () => ({
  eq: jest.fn(() => 'eq-expr'),
  and: jest.fn(() => 'and-expr'),
  inArray: jest.fn(() => 'inarray-expr'),
}));

jest.mock('../storage/db/schema', () => ({
  surveys: {
    id: 'surveys.id',
    instrumentId: 'surveys.instrumentId',
    campaignSessionId: 'surveys.campaignSessionId',
    status: 'surveys.status',
  },
  responses: {
    surveyId: 'responses.surveyId',
    questionId: 'responses.questionId',
    booleanValue: 'responses.booleanValue',
  },
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __chain: dbChain } = require('../storage/db/db');
const mockGet = dbChain.get as jest.Mock;
const mockAll = dbChain.all as jest.Mock;

const mockInstrumentCacheGet = instrumentCacheStorage.get as jest.Mock;
const mockCampaignCacheGet = campaignCacheStorage.get as jest.Mock;

// ─── Fixtures: valores reales de producción ──────────────────────────────────

const CAMPAIGN_ID = 'campaign-1';
const SURVEY_ID = 'survey-s2-1';
const INSTRUMENT_ID = 'inst-s2';

/** Catálogo TypeOfCrop tal como lo seedea el backend. */
const PRODUCTION_CATALOG = [
  { cropId: 'crop-cacao-uuid', name: 'Cacao' },
  { cropId: 'crop-cafe-uuid', name: 'Café' },
  { cropId: 'crop-cannabis-uuid', name: 'Cannabis' },
  { cropId: 'crop-canamo-uuid', name: 'Cáñamo' },
];

/** systemField tal como lo seedea el instrumento S2 en producción. */
const PRODUCTION_CROP_QUESTIONS = {
  'q-cacao': 'crop.cacao',
  'q-cafe': 'crop.cafe',
  'q-cannabis': 'crop.cannabis',
  'q-canamo': 'crop.canamo',
};

function makeInstrument(fields: Record<string, string>) {
  return {
    instrumentId: INSTRUMENT_ID,
    sections: [
      {
        sectionId: 'sec-1',
        questions: Object.entries(fields).map(([questionId, systemField]) => ({
          questionId,
          systemField,
        })),
      },
    ],
  };
}

function makeCampaign(availableCrops: { cropId: string; name: string }[]) {
  return {
    campaignId: CAMPAIGN_ID,
    name: 'Campaña de prueba',
    steps: [],
    availableCrops,
  };
}

/**
 * Monta el escenario completo: la encuesta S2 existe, el instrumento está en
 * caché con los systemField de producción, la campaña trae el catálogo real, y
 * `affirmativeQuestionIds` son las preguntas respondidas "Sí".
 */
function arrangeScenario(affirmativeQuestionIds: string[]) {
  mockGet.mockResolvedValue({ instrumentId: INSTRUMENT_ID });
  mockInstrumentCacheGet.mockResolvedValue(makeInstrument(PRODUCTION_CROP_QUESTIONS));
  mockAll.mockResolvedValue(affirmativeQuestionIds.map((questionId) => ({ questionId })));
  mockCampaignCacheGet.mockResolvedValue(makeCampaign(PRODUCTION_CATALOG));
}

beforeEach(() => {
  jest.clearAllMocks();
  dbChain.from.mockReturnThis();
  dbChain.where.mockReturnThis();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('spec49 / Bug A — extractCropsOffline con valores de producción', () => {
  // Criterio 1
  it('resuelve crop.cafe (ASCII) al cultivo "Café" del catálogo', async () => {
    arrangeScenario(['q-cafe']);

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([{ cropId: 'crop-cafe-uuid', name: 'Café' }]);
  });

  // Criterio 2 — el caso más sensible: tilde + ñ + mayúscula
  it('resuelve crop.canamo (ASCII) al cultivo "Cáñamo" del catálogo', async () => {
    arrangeScenario(['q-canamo']);

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([{ cropId: 'crop-canamo-uuid', name: 'Cáñamo' }]);
  });

  // Criterio 2 — los cultivos sin tilde también fallan hoy, por la mayúscula
  it.each([
    ['crop.cacao', 'Cacao', 'q-cacao', 'crop-cacao-uuid'],
    ['crop.cannabis', 'Cannabis', 'q-cannabis', 'crop-cannabis-uuid'],
  ])('resuelve %s al cultivo "%s" del catálogo', async (_sf, name, questionId, cropId) => {
    arrangeScenario([questionId]);

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([{ cropId, name }]);
  });

  // Criterio 2 — los cuatro a la vez
  it('resuelve los cuatro cultivos de producción cuando todos se responden "Sí"', async () => {
    arrangeScenario(['q-cacao', 'q-cafe', 'q-cannabis', 'q-canamo']);

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toHaveLength(4);
    expect(result).toEqual(expect.arrayContaining(PRODUCTION_CATALOG));
  });

  // Criterio 3 — no se inventan cultivos que la campaña no ofrece
  it('excluye un cultivo respondido "Sí" que no está en availableCrops de la campaña', async () => {
    mockGet.mockResolvedValue({ instrumentId: INSTRUMENT_ID });
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument(PRODUCTION_CROP_QUESTIONS));
    mockAll.mockResolvedValue([{ questionId: 'q-cannabis' }]);
    // La campaña solo ofrece café y cacao.
    mockCampaignCacheGet.mockResolvedValue(
      makeCampaign([
        { cropId: 'crop-cafe-uuid', name: 'Café' },
        { cropId: 'crop-cacao-uuid', name: 'Cacao' },
      ]),
    );

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([]);
  });

  // Criterio 3 — solo los afirmativos, con fixtures de producción
  it('devuelve solo los cultivos respondidos "Sí", no todos los del instrumento', async () => {
    arrangeScenario(['q-cafe']);

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([{ cropId: 'crop-cafe-uuid', name: 'Café' }]);
    expect(result).not.toEqual(expect.arrayContaining([{ cropId: 'crop-cacao-uuid', name: 'Cacao' }]));
  });

  // Documenta la convención de la que depende la normalización (ver
  // "Decisión de diseño — Fase 1" del spec 49): el systemField es la forma
  // ASCII/minúscula del nombre del catálogo. Si un cultivo nuevo rompe esa
  // convención, este caso falla de forma explícita en vez de devolver [].
  it('resuelve un cultivo nuevo del catálogo sin cambios en la app, si sigue la convención ASCII', async () => {
    mockGet.mockResolvedValue({ instrumentId: INSTRUMENT_ID });
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument({ 'q-platano': 'crop.platano' }));
    mockAll.mockResolvedValue([{ questionId: 'q-platano' }]);
    mockCampaignCacheGet.mockResolvedValue(
      makeCampaign([{ cropId: 'crop-platano-uuid', name: 'Plátano' }]),
    );

    const result = await extractCropsOffline(SURVEY_ID, CAMPAIGN_ID);

    expect(result).toEqual([{ cropId: 'crop-platano-uuid', name: 'Plátano' }]);
  });
});
