/**
 * Unit tests for extractFarmerLocally — spec 84, campo `farm.corregimiento`.
 *
 * El instrumento de Registro (S_REG) agrega `farm.corregimiento`, que debe
 * poblarse en `LocalFarmerDraft` igual que `farmName` en los tres caminos de
 * retorno: sin caché (provisional), caché con el mismo nombre y colisión.
 *
 * Colaboradores mockeados igual que en `e2e-068-documentIdCollision.test.ts`.
 */

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

jest.mock('../storage/surveyDraftStore', () => ({
  surveyDraftStore: { loadDraft: jest.fn() },
}));

jest.mock('../storage/instrumentCache', () => ({
  instrumentCacheStorage: { get: jest.fn() },
}));

jest.mock('../storage/farmerCache', () => ({
  farmerCacheStorage: { getByDocumentId: jest.fn() },
}));

jest.mock('../lib/generateLocalId', () => ({
  generateLocalId: jest.fn(() => 'local_farmer_test_0084'),
}));

import { extractFarmerLocally } from '../lib/extractFarmerLocally';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { farmerCacheStorage } from '../storage/farmerCache';

const mockLoadDraft = surveyDraftStore.loadDraft as jest.Mock;
const mockGetInstrument = instrumentCacheStorage.get as jest.Mock;
const mockGetByDocumentId = farmerCacheStorage.getByDocumentId as jest.Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SURVEY_ID = 'local_survey_0084';
const INSTRUMENT_ID = 'instrumento-sreg-0084';

const Q_NOMBRE = 'q-nombre-0084';
const Q_DOCUMENTO = 'q-documento-0084';
const Q_FINCA = 'q-finca-0084';
const Q_CORREGIMIENTO = 'q-corregimiento-0084';

const NOMBRE = 'Luz Dary Ospina';
const DOCUMENTO = '9084000001';
const FINCA = 'El Porvenir';
const CORREGIMIENTO = 'La Marina';

/** Instrumento S_REG cacheado con los systemField relevantes. */
const INSTRUMENTO_REGISTRO = {
  instrumentId: INSTRUMENT_ID,
  code: 'S_REG',
  name: 'Registro del productor',
  sections: [
    {
      sectionId: 'sec-0084',
      name: 'Registro',
      order: 1,
      questions: [
        { questionId: Q_NOMBRE, order: 1, systemField: 'farmer.name' },
        { questionId: Q_DOCUMENTO, order: 2, systemField: 'farmer.documentId' },
        { questionId: Q_FINCA, order: 3, systemField: 'farm.name' },
        { questionId: Q_CORREGIMIENTO, order: 4, systemField: 'farm.corregimiento' },
      ],
    },
  ],
};

function draft(answers: Record<string, { textValue?: string }>) {
  return { surveyId: SURVEY_ID, instrumentId: INSTRUMENT_ID, answers };
}

const RESPUESTAS_COMPLETAS = {
  [Q_NOMBRE]: { textValue: NOMBRE },
  [Q_DOCUMENTO]: { textValue: DOCUMENTO },
  [Q_FINCA]: { textValue: FINCA },
  [Q_CORREGIMIENTO]: { textValue: CORREGIMIENTO },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetInstrument.mockResolvedValue(INSTRUMENTO_REGISTRO);
  mockGetByDocumentId.mockResolvedValue(null);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('extractFarmerLocally — spec 84, farm.corregimiento', () => {
  it('pobla corregimiento y farmName en el borrador provisional cuando el documento no está en caché', async () => {
    mockLoadDraft.mockResolvedValue(draft(RESPUESTAS_COMPLETAS));

    const result = await extractFarmerLocally(SURVEY_ID);

    expect(result).toEqual(
      expect.objectContaining({
        farmerId: 'local_farmer_test_0084',
        name: NOMBRE,
        documentId: DOCUMENTO,
        farmName: FINCA,
        corregimiento: CORREGIMIENTO,
        isProvisional: true,
      }),
    );
    expect(result?.collision).toBeUndefined();
  });

  it('pobla corregimiento cuando el productor se resuelve desde la caché con el mismo nombre', async () => {
    mockLoadDraft.mockResolvedValue(draft(RESPUESTAS_COMPLETAS));
    mockGetByDocumentId.mockResolvedValue({
      farmerId: 'a3f1c9d2-0000-4000-8000-000000000084',
      name: NOMBRE,
      documentId: DOCUMENTO,
      phone: null,
      farmName: 'Nombre viejo en caché',
      cachedAt: new Date('2026-09-01T10:00:00Z'),
    });

    const result = await extractFarmerLocally(SURVEY_ID);

    expect(result?.isProvisional).toBe(false);
    expect(result?.farmerId).toBe('a3f1c9d2-0000-4000-8000-000000000084');
    // Igual que farmName: sale de lo digitado en el borrador, no de la caché.
    expect(result?.farmName).toBe(FINCA);
    expect(result?.corregimiento).toBe(CORREGIMIENTO);
  });

  it('pobla corregimiento también cuando se detecta una colisión de documento', async () => {
    mockLoadDraft.mockResolvedValue(draft(RESPUESTAS_COMPLETAS));
    mockGetByDocumentId.mockResolvedValue({
      farmerId: 'a3f1c9d2-0000-4000-8000-000000000085',
      name: 'Otra Persona Distinta',
      documentId: DOCUMENTO,
      cachedAt: new Date('2026-09-01T10:00:00Z'),
    });

    const result = await extractFarmerLocally(SURVEY_ID);

    expect(result?.collision).toBeDefined();
    expect(result?.farmName).toBe(FINCA);
    expect(result?.corregimiento).toBe(CORREGIMIENTO);
  });

  it('deja corregimiento en null cuando la pregunta no se respondió', async () => {
    const { [Q_CORREGIMIENTO]: _omitida, ...sinCorregimiento } = RESPUESTAS_COMPLETAS;
    mockLoadDraft.mockResolvedValue(draft(sinCorregimiento));

    const result = await extractFarmerLocally(SURVEY_ID);

    expect(result?.farmName).toBe(FINCA);
    expect(result?.corregimiento).toBeNull();
  });

  it('deja corregimiento en null cuando el instrumento no tiene la pregunta farm.corregimiento', async () => {
    mockGetInstrument.mockResolvedValue({
      ...INSTRUMENTO_REGISTRO,
      sections: [
        {
          ...INSTRUMENTO_REGISTRO.sections[0],
          questions: INSTRUMENTO_REGISTRO.sections[0].questions.filter(
            (q) => q.systemField !== 'farm.corregimiento',
          ),
        },
      ],
    });
    mockLoadDraft.mockResolvedValue(draft(RESPUESTAS_COMPLETAS));

    const result = await extractFarmerLocally(SURVEY_ID);

    expect(result?.farmName).toBe(FINCA);
    expect(result?.corregimiento).toBeNull();
  });
});
