/**
 * Spec 104 (etapa A) — hallazgos M1 y M2 de la auditoría 84 del móvil.
 *  M1: refresh() vacía la caché de instrumentos pero conserva los de borradores pendientes.
 *  M2: la superposición de cobertura cuenta también las encuestas de sesiones heredadas.
 */
jest.mock('../lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../storage/campaignCache', () => ({
  campaignCacheStorage: { clear: jest.fn(), save: jest.fn(), list: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../storage/instrumentCache', () => ({
  instrumentCacheStorage: {
    clear: jest.fn(),
    save: jest.fn(),
    get: jest.fn(),
    listCachedIds: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../storage/farmerCache', () => ({
  farmerCacheStorage: { upsert: jest.fn(), recordConsent: jest.fn(), get: jest.fn() },
}));
jest.mock('../storage/consentDocumentCache', () => ({ consentDocumentCacheStorage: { save: jest.fn() } }));
jest.mock('../api/instruments', () => ({
  fetchInstrumentRender: jest.fn(),
  fetchInstrumentByCode: jest.fn().mockRejectedValue(new Error('not configured')),
}));
jest.mock('../api/consents', () => ({ fetchActiveConsentDocument: jest.fn().mockRejectedValue(new Error('none')) }));
jest.mock('../api/farmers', () => ({ listAllFarmers: jest.fn().mockResolvedValue([]) }));
jest.mock('../api/coverage', () => ({ fetchCoverageSnapshot: jest.fn() }));
jest.mock('../storage/coverageCache', () => ({
  coverageCacheStorage: { replaceAll: jest.fn(), getSnapshotMeta: jest.fn().mockResolvedValue(null) },
}));
jest.mock('../storage/surveyDraftStore', () => ({ surveyDraftStore: { listUnsyncedInstrumentIds: jest.fn() } }));
jest.mock('../store/useCachedInstrumentsStore', () => ({
  useCachedInstrumentsStore: { getState: () => ({ loadFromCache: jest.fn() }) },
}));

import * as fs from 'fs';
import * as path from 'path';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { fetchInstrumentRender } from '../api/instruments';
import { fetchCoverageSnapshot } from '../api/coverage';
import { useCachedCampaignsStore } from '../store/useCachedCampaignsStore';

const snapshot = {
  computedAt: '2026-11-20T15:00:00.000Z',
  instruments: [
    { instrumentId: 'i-new', name: 'N', code: null, scopeLevel: 'farmer', cropIds: [], coverageGroup: null, memberIds: ['i-new'] },
  ],
  farmers: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  (fetchCoverageSnapshot as jest.Mock).mockResolvedValue(snapshot);
  (fetchInstrumentRender as jest.Mock).mockImplementation(async (id: string) => ({ instrumentId: id }));
});

describe('M1 — instrumentos de borradores pendientes', () => {
  it('vacía la caché y conserva el instrumento de un borrador que ya no viene en la descarga', async () => {
    (surveyDraftStore.listUnsyncedInstrumentIds as jest.Mock).mockResolvedValue(['i-legacy', 'i-new']);
    (instrumentCacheStorage.get as jest.Mock).mockResolvedValue({ instrumentId: 'i-legacy', name: 'Viejo' });

    await useCachedCampaignsStore.getState().refresh();

    expect(instrumentCacheStorage.clear).toHaveBeenCalledTimes(1);
    const saved = (instrumentCacheStorage.save as jest.Mock).mock.calls.map((c) => c[0].instrumentId);
    expect(saved).toEqual(expect.arrayContaining(['i-new', 'i-legacy']));
    // El que sí se descargó no se vuelve a leer de la caché.
    expect(instrumentCacheStorage.get).not.toHaveBeenCalledWith('i-new');
  });

  it('si falla la lectura de borradores, no se vacía la caché y se actualiza por encima', async () => {
    (surveyDraftStore.listUnsyncedInstrumentIds as jest.Mock).mockRejectedValue(new Error('JSON corrupto'));

    await useCachedCampaignsStore.getState().refresh();

    expect(instrumentCacheStorage.clear).not.toHaveBeenCalled();
    const saved = (instrumentCacheStorage.save as jest.Mock).mock.calls.map((c) => c[0].instrumentId);
    expect(saved).toEqual(['i-new']);
  });

  it('sin borradores, solo queda lo descargado', async () => {
    (surveyDraftStore.listUnsyncedInstrumentIds as jest.Mock).mockResolvedValue([]);

    await useCachedCampaignsStore.getState().refresh();

    const saved = (instrumentCacheStorage.save as jest.Mock).mock.calls.map((c) => c[0].instrumentId);
    expect(saved).toEqual(['i-new']);
  });
});

describe('M2 — la cobertura local cuenta las encuestas de sesión heredada', () => {
  it('listForCoverage no filtra por campaignSessionId', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../storage/surveyDraftStore.ts'), 'utf8');
    const start = src.indexOf('async listForCoverage');
    const body = src.slice(start, src.indexOf('async markCompleted', start));
    expect(body).not.toMatch(/campaignSessionId/);
  });
});

describe('Cierre del flujo por productor (borradores heredados incluidos)', () => {
  it('el botón final dice «Volver al productor» cuando se vuelve a la ficha', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../app/instrument/[id]/completed.tsx'),
      'utf8',
    );
    expect(src).toContain('"Volver al productor"');
    expect(src).toMatch(/productorFarmerId\s*\n?\s*\?\s*"Volver al productor"/);
  });
});
