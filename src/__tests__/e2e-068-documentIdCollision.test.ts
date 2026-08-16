/**
 * Spec 68 — Colisión de `documentId` entre agricultores distintos (lado cliente).
 *
 * Cubre los criterios de aceptación 7, 10, 11 y 12 de
 * `spec/68_colision_documentid_entre_agricultores.md`.
 *
 * **ARRANCA EN ROJO.** Dos piezas todavía no existen:
 *
 *  A) `src/lib/nameMatching.ts` — la regla de comparación de nombres, espejo de
 *     la del backend. La suite entera falla al importarla mientras no exista, y
 *     eso es deliberado: es la pieza que no puede divergir del backend (mismo
 *     error que `CROP_FIELD_MAP` en el spec 49, Bug A).
 *
 *  B) La detección en `extractFarmerLocally()` — hoy
 *     (`src/lib/extractFarmerLocally.ts`) resuelve por `farmerCacheStorage
 *     .getByDocumentId(documentId)` y devuelve `cached.name` **descartando el
 *     nombre que el encuestador acaba de digitar**, sin compararlos. Es el
 *     mismo bug del backend, un nivel más arriba, y con el agravante de que la
 *     app pasa a mostrar el nombre equivocado en pantalla.
 *
 * La batería de nombres de esta suite es **la misma tabla** del § "Batería de
 * casos de nombres" del spec y de `backend/test/e2e-068-documentid-collision.e2e-spec.ts`.
 * Si se agrega un caso, se agrega en los tres lugares.
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
  generateLocalId: jest.fn(() => 'local_farmer_test_0001'),
}));

jest.mock('../api/httpClient', () => {
  // Nota: el `ServerError` real (`src/api/httpClient.ts`) hoy DESCARTA el cuerpo
  // de los 4xx y solo conserva `message`. Este doble lleva `body` porque el 409
  // del spec 68 necesita llegar con su payload al cliente — es parte de lo que
  // hay que implementar (Fase 3), no una licencia del test.
  class ServerError extends Error {
    status: number;
    body?: unknown;
    constructor(status: number, message: string, body?: unknown) {
      super(message);
      this.name = 'ServerError';
      this.status = status;
      this.body = body;
    }
  }
  class NetworkError extends Error {
    constructor(message = 'Sin conexión a internet') {
      super(message);
      this.name = 'NetworkError';
    }
  }
  return {
    ServerError,
    NetworkError,
    httpClient: { get: jest.fn(), post: jest.fn() },
  };
});

import { isSameFarmerName } from '../lib/nameMatching';
import { extractFarmerLocally } from '../lib/extractFarmerLocally';
import { extractFarmer, DocumentIdCollisionError } from '../api/farmers';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { farmerCacheStorage } from '../storage/farmerCache';
import { httpClient, ServerError } from '../api/httpClient';

const mockLoadDraft = surveyDraftStore.loadDraft as jest.Mock;
const mockGetInstrument = instrumentCacheStorage.get as jest.Mock;
const mockGetByDocumentId = farmerCacheStorage.getByDocumentId as jest.Mock;
const mockPost = httpClient.post as jest.Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DOCUMENTO = '9068000010';
const NOMBRE_REGISTRADO = 'Santiago Suarez Cortes';
const NOMBRE_DIGITADO = 'Karol Vanessa Quintero Marin';

const Q_NOMBRE = 'q-nombre-0001';
const Q_DOCUMENTO = 'q-documento-0001';

const S1_SURVEY_ID = 'local_survey_0001';
const INSTRUMENT_ID = 'instrumento-s1a-0001';

/** Instrumento S1a-like cacheado, con los dos systemField relevantes. */
const INSTRUMENTO_CACHEADO = {
  instrumentId: INSTRUMENT_ID,
  code: 'S1',
  name: 'S1a Identificación',
  sections: [
    {
      sectionId: 'sec-0001',
      name: 'Identificación',
      order: 1,
      questions: [
        { questionId: Q_NOMBRE, order: 1, systemField: 'farmer.name' },
        { questionId: Q_DOCUMENTO, order: 2, systemField: 'farmer.documentId' },
      ],
    },
  ],
};

/** Entrada ya presente en la caché local: el titular real del documento. */
const CACHE_TITULAR = {
  farmerId: 'a3f1c9d2-0000-4000-8000-000000000068',
  name: NOMBRE_REGISTRADO,
  documentId: DOCUMENTO,
  phone: '3001234567',
  farmName: 'Zeus',
  cachedAt: new Date('2026-08-12T10:00:00Z'),
};

function draftConNombre(nombre: string) {
  return {
    surveyId: S1_SURVEY_ID,
    instrumentId: INSTRUMENT_ID,
    answers: {
      [Q_NOMBRE]: { textValue: nombre },
      [Q_DOCUMENTO]: { textValue: DOCUMENTO },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetInstrument.mockResolvedValue(INSTRUMENTO_CACHEADO);
});

// ─── Criterio 7: la regla de nombres, idéntica a la del backend ──────────────

describe('spec68 — regla de comparación de nombres', () => {
  // Fuente de verdad: § "Batería de casos de nombres" del spec 68.
  const casos: { etiqueta: string; digitado: string; mismaPersona: boolean }[] = [
    { etiqueta: 'idéntico', digitado: 'Santiago Suarez Cortes', mismaPersona: true },
    { etiqueta: 'mayúsculas y sin tildes', digitado: 'SANTIAGO SUAREZ CORTES', mismaPersona: true },
    { etiqueta: 'con tildes', digitado: 'Santiago Suárez Cortés', mismaPersona: true },
    { etiqueta: 'espacios repetidos', digitado: 'Santiago  Suarez   Cortes', mismaPersona: true },
    { etiqueta: 'apellido omitido', digitado: 'Santiago Suarez', mismaPersona: true },
    { etiqueta: 'error de tipeo', digitado: 'Santigo Suarez Cortes', mismaPersona: true },
    { etiqueta: 'primer nombre + un apellido', digitado: 'Santiago Suarez Marin', mismaPersona: true },
    { etiqueta: 'puntuación', digitado: 'Santiago Suarez Cortes.', mismaPersona: true },
    { etiqueta: 'otro primer nombre', digitado: 'Maria Suarez Cortes', mismaPersona: false },
    { etiqueta: 'ningún apellido en común', digitado: 'Santiago Quintero Marin', mismaPersona: false },
    { etiqueta: 'persona distinta', digitado: NOMBRE_DIGITADO, mismaPersona: false },
  ];

  it.each(casos)('$etiqueta → $digitado', ({ digitado, mismaPersona }) => {
    expect(isSameFarmerName(NOMBRE_REGISTRADO, digitado)).toBe(mismaPersona);
  });

  it('es simétrica: el orden de los argumentos no cambia el resultado', () => {
    for (const { digitado } of casos) {
      expect(isSameFarmerName(NOMBRE_REGISTRADO, digitado)).toBe(
        isSameFarmerName(digitado, NOMBRE_REGISTRADO),
      );
    }
  });

  // Sin nombre registrado no hay con qué comparar → conservador (caso 13 del spec).
  it('trata como personas distintas cuando falta uno de los nombres', () => {
    expect(isSameFarmerName('', NOMBRE_DIGITADO)).toBe(false);
    expect(isSameFarmerName(NOMBRE_REGISTRADO, '')).toBe(false);
  });
});

// ─── Criterios 10 y 11: detección offline contra la caché local ──────────────

describe('spec68 — extractFarmerLocally ante una colisión de documento', () => {
  // Criterio 10
  it('devuelve la colisión en vez de la identidad cacheada cuando los nombres no corresponden', async () => {
    mockLoadDraft.mockResolvedValue(draftConNombre(NOMBRE_DIGITADO));
    mockGetByDocumentId.mockResolvedValue(CACHE_TITULAR);

    const result = await extractFarmerLocally(S1_SURVEY_ID);

    expect(result?.collision).toEqual(
      expect.objectContaining({
        documentId: DOCUMENTO,
        existingFarmerId: CACHE_TITULAR.farmerId,
        existingName: NOMBRE_REGISTRADO,
        submittedName: NOMBRE_DIGITADO,
      }),
    );
  });

  // Criterio 11 — el síntoma más visible en campo: la app mostrando el nombre
  // de otra persona mientras se entrevista al agricultor que está enfrente.
  it('nunca devuelve el nombre cacheado en lugar del nombre digitado', async () => {
    mockLoadDraft.mockResolvedValue(draftConNombre(NOMBRE_DIGITADO));
    mockGetByDocumentId.mockResolvedValue(CACHE_TITULAR);

    const result = await extractFarmerLocally(S1_SURVEY_ID);

    expect(result?.name).toBe(NOMBRE_DIGITADO);
    expect(result?.name).not.toBe(NOMBRE_REGISTRADO);
    expect(result?.farmerId).not.toBe(CACHE_TITULAR.farmerId);
  });

  // Criterio 6 llevado al cliente: el re-encuentro legítimo no puede molestar.
  it('no reporta colisión cuando el nombre digitado equivale al cacheado', async () => {
    mockLoadDraft.mockResolvedValue(draftConNombre('SANTIAGO SUAREZ'));
    mockGetByDocumentId.mockResolvedValue(CACHE_TITULAR);

    const result = await extractFarmerLocally(S1_SURVEY_ID);

    expect(result?.collision).toBeUndefined();
    expect(result?.farmerId).toBe(CACHE_TITULAR.farmerId);
    expect(result?.isProvisional).toBe(false);
  });

  it('no reporta colisión cuando el documento no está en la caché local', async () => {
    mockLoadDraft.mockResolvedValue(draftConNombre(NOMBRE_DIGITADO));
    mockGetByDocumentId.mockResolvedValue(null);

    const result = await extractFarmerLocally(S1_SURVEY_ID);

    expect(result?.collision).toBeUndefined();
    expect(result?.name).toBe(NOMBRE_DIGITADO);
    expect(result?.isProvisional).toBe(true);
  });
});

// ─── Criterio 12: el 409 llega tipado al cliente y la resolución viaja ───────

describe('spec68 — contrato de extractFarmer() contra el backend', () => {
  const CONFLICTO = {
    documentId: DOCUMENTO,
    existingFarmer: { farmerId: CACHE_TITULAR.farmerId, name: NOMBRE_REGISTRADO },
    submittedName: NOMBRE_DIGITADO,
  };

  it('convierte el 409 del backend en un error tipado con el detalle del conflicto', async () => {
    mockPost.mockRejectedValue(
      new ServerError(409, 'Documento ya registrado', CONFLICTO),
    );

    await expect(extractFarmer('survey-0001')).rejects.toBeInstanceOf(
      DocumentIdCollisionError,
    );

    mockPost.mockRejectedValue(
      new ServerError(409, 'Documento ya registrado', CONFLICTO),
    );
    await extractFarmer('survey-0001').catch((err: DocumentIdCollisionError) => {
      expect(err.documentId).toBe(DOCUMENTO);
      expect(err.existingFarmerName).toBe(NOMBRE_REGISTRADO);
      expect(err.submittedName).toBe(NOMBRE_DIGITADO);
    });
  });

  it('envía la resolución elegida por el encuestador en el cuerpo de la petición', async () => {
    mockPost.mockResolvedValue({
      farmer: { id: CACHE_TITULAR.farmerId, name: NOMBRE_REGISTRADO, documentId: DOCUMENTO },
      existed: true,
    });

    await extractFarmer('survey-0001', { resolution: 'same_person' });

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining('survey-0001'),
      expect.objectContaining({ resolution: 'same_person' }),
    );
  });

  // Durante la sincronización el encuestador ya no está frente al agricultor:
  // el default nunca puede ser fusionar en silencio (§ Resolución diferida).
  it('sin resolución explícita no envía ninguna, para que el backend responda 409', async () => {
    mockPost.mockResolvedValue({
      farmer: { id: 'f-0002', name: NOMBRE_DIGITADO, documentId: DOCUMENTO },
      existed: false,
    });

    await extractFarmer('survey-0001');

    const body = mockPost.mock.calls[0][1] as Record<string, unknown> | undefined;
    expect(body?.resolution).toBeUndefined();
  });

  it('no convierte en colisión los errores que no son 409', async () => {
    mockPost.mockRejectedValue(new ServerError(404, 'Survey not found'));

    await expect(extractFarmer('survey-0001')).rejects.not.toBeInstanceOf(
      DocumentIdCollisionError,
    );
  });
});
