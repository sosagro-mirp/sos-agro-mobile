/**
 * Spec 103 — Flujo del encuestador por productor en el móvil (H6).
 * Descarga de la foto de cobertura e instrumentos por unión, con reemplazo
 * atómico (DM2, DM4, DM6) y consentimiento vigente desde `hasPendingConsent`.
 * Cubre los criterios C1, C11 y C13 de
 * `spec/103_encuestador_movil_por_productor.md`. Complementa (sin modificarlo)
 * `cachedCampaignsRefresh.test.ts`.
 *
 * ARRANCA EN ROJO. Motivos esperados:
 *   - `src/api/coverage.ts` y `src/storage/coverageCache.ts` no existen y
 *     `endpoints.coverageSnapshot` no está definido (Fases 2 y 3).
 *   - `refresh()` no descarga la foto, solo descarga los instrumentos de
 *     campañas y no lee `hasPendingConsent` (Fase 3).
 *
 * Los módulos nuevos se registran con `jest.doMock(..., { virtual })`, donde
 * `virtual` es true solo mientras el archivo no exista: así el arnés funciona
 * hoy (rojo por aserción) y seguirá funcionando cuando se implementen.
 *
 * ── Contratos ────────────────────────────────────────────────────────────────
 *
 *   // src/api/endpoints.ts
 *   coverageSnapshot: '/api/coverage/farmers/snapshot'
 *
 *   // src/api/coverage.ts
 *   export function fetchCoverageSnapshot(opts?: RequestOptions): Promise<CoverageSnapshot>;
 *   // CoverageSnapshot = salida de `toCoverageSnapshot` del backend
 *   // (`backend/src/coverage/e2e-103-coverage-snapshot.spec.ts`):
 *   //   { computedAt: string; instruments: CoverageColumn[]; farmers: SnapshotFarmer[] }
 *
 *   // src/storage/coverageCache.ts
 *   export const coverageCacheStorage: {
 *     replaceAll(snapshot: CoverageSnapshot, downloadedAt?: Date): Promise<void>;
 *       // UNA transacción (`db.transaction`): borra y reescribe
 *       // `coverage_snapshot` y `farmer_coverage_cache`, conservando las filas
 *       // provisionales (`local_farmer_*`) que aún no sincronizan.
 *     getSnapshotMeta(): Promise<{ computedAt: string; downloadedAt: Date; columns: CoverageColumn[] } | null>;
 *     list(): Promise<CoverageListRow[]>;            // ver e2e-103-productorFilters
 *     getDetail(farmerId: string): Promise<FarmerCoverageDetail | null>; // ver e2e-103-coverageOverlay
 *     addProvisional(farmer: { farmerId: string; name: string; documentId: string | null }): Promise<void>;
 *     remapFarmer(localFarmerId: string, realFarmerId: string): Promise<void>;
 *   };
 *
 *   // src/store/useCachedCampaignsStore.ts
 *   DownloadProgress.phase gana 'coverage'.
 *   Estado nuevo `snapshotComputedAt: string | null` («Cobertura al {fecha}»).
 *   refresh(): descarga campañas, foto, instrumentos de la UNIÓN (campañas +
 *     `memberIds` de las columnas de la foto, sin repetir), S_REG/S1/S2,
 *     consentimiento y productores; reemplaza caché de campañas,
 *     instrumentos y foto SOLO si todo lo anterior salió bien.
 *     Con `hasPendingConsent: false` en `GET /api/farmers`, el productor queda
 *     en `farmer_cache` con la versión activa del documento de consentimiento
 *     (vía `upsert` con `consentVersion` o `recordConsent(farmerId, version, fecha)`).
 *   refreshCoverageSnapshot(): Promise<void> — solo la foto y los instrumentos
 *     de sus columnas que falten (DM4, tras un sync exitoso con red); no toca
 *     la caché de campañas y ante un fallo conserva la foto anterior.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Mocks de módulos existentes (hoisted) ───────────────────────────────────

jest.mock('../lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../storage/campaignCache', () => ({
  campaignCacheStorage: { clear: jest.fn(), save: jest.fn(), list: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../storage/instrumentCache', () => ({
  instrumentCacheStorage: {
    clear: jest.fn(),
    save: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    listCachedIds: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../storage/farmerCache', () => ({
  farmerCacheStorage: { upsert: jest.fn(), recordConsent: jest.fn().mockResolvedValue(1), get: jest.fn().mockResolvedValue(null) },
}));
jest.mock('../storage/consentDocumentCache', () => ({ consentDocumentCacheStorage: { save: jest.fn() } }));
jest.mock('../api/campaigns', () => ({ fetchActiveCampaigns: jest.fn(), fetchCampaignRender: jest.fn() }));
jest.mock('../api/instruments', () => ({
  fetchInstrumentRender: jest.fn(),
  fetchInstrumentByCode: jest.fn().mockRejectedValue(new Error('not configured')),
}));
jest.mock('../api/consents', () => ({ fetchActiveConsentDocument: jest.fn() }));
jest.mock('../api/farmers', () => ({ listAllFarmers: jest.fn().mockResolvedValue([]) }));
jest.mock('../store/useCachedInstrumentsStore', () => ({
  useCachedInstrumentsStore: { getState: () => ({ loadFromCache: jest.fn() }) },
}));
jest.mock('../api/httpClient', () => {
  const actual = jest.requireActual('../api/httpClient');
  return { ...actual, httpClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } };
});

// ─── Mocks de módulos futuros ────────────────────────────────────────────────

function moduleExists(rel: string): boolean {
  const base = path.resolve(__dirname, rel);
  return ['.ts', '.tsx', '/index.ts'].some((ext) => fs.existsSync(base + ext));
}

const coverageApiMock = { fetchCoverageSnapshot: jest.fn() };
const coverageCacheMock = {
  coverageCacheStorage: {
    replaceAll: jest.fn().mockResolvedValue(undefined),
    getSnapshotMeta: jest.fn().mockResolvedValue(null),
    list: jest.fn().mockResolvedValue([]),
    getDetail: jest.fn().mockResolvedValue(null),
    addProvisional: jest.fn().mockResolvedValue(undefined),
    remapFarmer: jest.fn().mockResolvedValue(undefined),
  },
};

jest.doMock('../api/coverage', () => coverageApiMock, { virtual: !moduleExists('../api/coverage') });
jest.doMock('../storage/coverageCache', () => coverageCacheMock, { virtual: !moduleExists('../storage/coverageCache') });

// ─── SUT e imports ───────────────────────────────────────────────────────────

import { campaignCacheStorage } from '../storage/campaignCache';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { farmerCacheStorage } from '../storage/farmerCache';
import { fetchActiveCampaigns, fetchCampaignRender } from '../api/campaigns';
import { fetchInstrumentRender } from '../api/instruments';
import { fetchActiveConsentDocument } from '../api/consents';
import { listAllFarmers } from '../api/farmers';
import { httpClient } from '../api/httpClient';
import { endpoints } from '../api/endpoints';

// Se carga después de los doMock para que vea los módulos futuros simulados.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCachedCampaignsStore } = require('../store/useCachedCampaignsStore') as typeof import('../store/useCachedCampaignsStore');

type StoreState = ReturnType<typeof useCachedCampaignsStore.getState> & {
  snapshotComputedAt?: string | null;
  refreshCoverageSnapshot?: () => Promise<void>;
};
const state = () => useCachedCampaignsStore.getState() as StoreState;

const mockFetchSnapshot = coverageApiMock.fetchCoverageSnapshot;
const mockReplaceAll = coverageCacheMock.coverageCacheStorage.replaceAll;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const campaign = {
  campaignId: 'c1',
  name: 'Campaña',
  steps: [{ instrument: { instrumentId: 'i-camp' } }, { instrument: { instrumentId: 'i-shared' } }],
};

const COMPUTED_AT = '2026-11-08T15:00:00.000Z';

const snapshot = {
  computedAt: COMPUTED_AT,
  instruments: [
    { instrumentId: 'i-prod', name: 'Productor', code: 'C_PROD', scopeLevel: 'farmer', cropIds: [], coverageGroup: 'g-prod', memberIds: ['i-prod', 'i-prod-v2'] },
    { instrumentId: 'i-shared', name: 'Compartido', code: null, scopeLevel: 'farm', cropIds: [], coverageGroup: null, memberIds: ['i-shared'] },
  ],
  farmers: [
    {
      farmerId: 'f-1',
      name: 'Ana Pérez',
      documentId: '1001',
      departmentId: 'd-1',
      townId: 't-1',
      farmsCount: 1,
      cropIds: [],
      hasPendingConsent: false,
      summary: { applicable: 2, applied: 0, partial: 0, pending: 2, notApplicable: 0, instrumentsWithoutScope: 0 },
      warnings: [],
      farms: [],
      instruments: [],
    },
  ],
};

const ACTIVE_DOC = { consentDocumentId: 'doc-1', version: '1.1' };

function givenHappyDownload() {
  (fetchActiveCampaigns as jest.Mock).mockResolvedValue([{ campaignId: 'c1', name: 'Campaña' }]);
  (fetchCampaignRender as jest.Mock).mockResolvedValue(campaign);
  (fetchInstrumentRender as jest.Mock).mockImplementation(async (id: string) => ({ instrumentId: id }));
  (fetchActiveConsentDocument as jest.Mock).mockResolvedValue(ACTIVE_DOC);
  mockFetchSnapshot.mockResolvedValue(snapshot);
}

const downloadedInstrumentIds = () =>
  (fetchInstrumentRender as jest.Mock).mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  jest.clearAllMocks();
  (listAllFarmers as jest.Mock).mockResolvedValue([]);
  useCachedCampaignsStore.setState({ campaigns: [campaign as never], error: null });
});

// ═══ API ═════════════════════════════════════════════════════════════════════

describe('fetchCoverageSnapshot — GET /api/coverage/farmers/snapshot', () => {
  it('el endpoint está centralizado en endpoints.ts', () => {
    expect((endpoints as Record<string, unknown>).coverageSnapshot).toBe('/api/coverage/farmers/snapshot');
  });

  it('hace un único GET y devuelve la foto', async () => {
    let mod: { fetchCoverageSnapshot: () => Promise<unknown> };
    try {
      mod = jest.requireActual('../api/coverage');
    } catch {
      throw new Error('Spec 103 — el módulo ../api/coverage todavía no existe');
    }
    (httpClient.get as jest.Mock).mockResolvedValueOnce(snapshot);

    const result = await mod.fetchCoverageSnapshot();

    expect(httpClient.get).toHaveBeenCalledTimes(1);
    expect((httpClient.get as jest.Mock).mock.calls[0][0]).toBe('/api/coverage/farmers/snapshot');
    expect(result).toEqual(snapshot);
  });
});

// ═══ C1 — refresh() descarga la foto y los instrumentos por unión ════════════

describe('refresh() — C1: foto de cobertura e instrumentos por unión (DM2, DM6)', () => {
  it('descarga la foto una sola vez y la guarda al final', async () => {
    givenHappyDownload();

    await state().refresh();

    expect(mockFetchSnapshot).toHaveBeenCalledTimes(1);
    expect(mockReplaceAll).toHaveBeenCalledTimes(1);
    expect(mockReplaceAll.mock.calls[0][0]).toEqual(snapshot);
  });

  // Spec 104 (etapa A): refresh() ya no descarga campañas; los instrumentos salen de la foto.
  it('descarga los instrumentos de las columnas (memberIds), sin repetir', async () => {
    givenHappyDownload();

    await state().refresh();

    const ids = downloadedInstrumentIds();
    expect(ids).toEqual(expect.arrayContaining(['i-shared', 'i-prod', 'i-prod-v2']));
    expect(ids).not.toContain('i-camp');
    expect(ids.filter((id) => id === 'i-shared')).toHaveLength(1);
  });

  it('guarda en caché los instrumentos de cobertura que no están en ninguna campaña', async () => {
    givenHappyDownload();

    await state().refresh();

    const saved = (instrumentCacheStorage.save as jest.Mock).mock.calls.map((c) => c[0].instrumentId);
    expect(saved).toEqual(expect.arrayContaining(['i-prod', 'i-prod-v2']));
  });

  it('expone la fecha de la foto para «Cobertura al {fecha}»', async () => {
    givenHappyDownload();

    await state().refresh();

    expect(state().snapshotComputedAt).toBe(COMPUTED_AT);
  });

  it('las campañas ya no se descargan y la caché de campañas queda intacta (spec 104, etapa A)', async () => {
    givenHappyDownload();

    await state().refresh();

    expect(fetchActiveCampaigns).not.toHaveBeenCalled();
    expect(fetchCampaignRender).not.toHaveBeenCalled();
    expect(campaignCacheStorage.save).not.toHaveBeenCalled();
    expect(campaignCacheStorage.clear).not.toHaveBeenCalled();
    expect(state().campaigns).toHaveLength(1);
  });
});

// ═══ C11 — consentimiento vigente desde hasPendingConsent ════════════════════

describe('refresh() — C11: quien consintió en otro dispositivo figura vigente sin conexión', () => {
  const recordedVersionFor = (farmerId: string): string | undefined => {
    const viaUpsert = (farmerCacheStorage.upsert as jest.Mock).mock.calls
      .map((c) => c[0])
      .find((e) => e.farmerId === farmerId && e.consentVersion);
    if (viaUpsert) return viaUpsert.consentVersion;
    const viaRecord = (farmerCacheStorage.recordConsent as jest.Mock).mock.calls.find((c) => c[0] === farmerId);
    return viaRecord?.[1];
  };

  it('hasPendingConsent: false → farmer_cache con la versión activa del documento', async () => {
    givenHappyDownload();
    (listAllFarmers as jest.Mock).mockResolvedValue([
      { farmerId: 'f-ok', name: 'Consintió en la web', documentId: '1', hasPendingConsent: false },
    ]);

    await state().refresh();

    expect(recordedVersionFor('f-ok')).toBe('1.1');
  });

  it('hasPendingConsent: true → no se le inventa un consentimiento', async () => {
    givenHappyDownload();
    (listAllFarmers as jest.Mock).mockResolvedValue([
      { farmerId: 'f-pend', name: 'Sin consentimiento', documentId: '2', hasPendingConsent: true },
    ]);

    await state().refresh();

    expect(recordedVersionFor('f-pend')).toBeUndefined();
    // Y el productor igual queda en la caché para buscarlo sin conexión.
    expect(farmerCacheStorage.upsert).toHaveBeenCalledWith(expect.objectContaining({ farmerId: 'f-pend' }));
  });
});

// ═══ C13 — una descarga fallida a mitad conserva todo lo anterior ════════════

describe('refresh() — C13: reemplazo atómico', () => {
  const expectNothingReplaced = () => {
    expect(mockReplaceAll).not.toHaveBeenCalled();
    expect(campaignCacheStorage.clear).not.toHaveBeenCalled();
    expect(instrumentCacheStorage.clear).not.toHaveBeenCalled();
    expect(state().campaigns).toHaveLength(1);
  };

  it('si falla la foto, conserva foto, instrumentos y campañas', async () => {
    givenHappyDownload();
    mockFetchSnapshot.mockRejectedValue(new Error('Network request failed'));

    await state().refresh().catch(() => undefined);

    // Se llegó a pedir la foto: el fallo es de la foto, no de un arnés roto.
    expect(mockFetchSnapshot).toHaveBeenCalled();
    expectNothingReplaced();
    expect(state().error).toBeTruthy();
  });

  it('si falla un instrumento de cobertura se omite y el resto se actualiza (decisión 2026-11-09, auditoría 79)', async () => {
    givenHappyDownload();
    (fetchInstrumentRender as jest.Mock).mockImplementation(async (id: string) => {
      if (id === 'i-prod-v2') throw new Error('Unauthorized');
      return { instrumentId: id };
    });

    await state().refresh();

    expect(downloadedInstrumentIds()).toContain('i-prod-v2');
    // Los demás instrumentos y la foto sí se reemplazan.
    expect(mockReplaceAll).toHaveBeenCalledTimes(1);
    const saved = (instrumentCacheStorage.save as jest.Mock).mock.calls.map((c) => c[0].instrumentId);
    expect(saved).toEqual(expect.arrayContaining(['i-shared', 'i-prod']));
    expect(saved).not.toContain('i-prod-v2');
    expect(state().error).toBeNull();
  });
});

// ═══ DM4 — refresco de la foto tras un sync exitoso ══════════════════════════

describe('refreshCoverageSnapshot() — DM4: solo la foto', () => {
  it('reemplaza la foto sin tocar la caché de campañas', async () => {
    givenHappyDownload();
    const fn = state().refreshCoverageSnapshot;
    expect(typeof fn).toBe('function');

    await fn!();

    expect(mockFetchSnapshot).toHaveBeenCalledTimes(1);
    expect(mockReplaceAll).toHaveBeenCalledTimes(1);
    expect(fetchActiveCampaigns).not.toHaveBeenCalled();
    expect(campaignCacheStorage.clear).not.toHaveBeenCalled();
  });

  it('ante un fallo conserva la foto anterior', async () => {
    mockFetchSnapshot.mockRejectedValue(new Error('Network request failed'));
    const fn = state().refreshCoverageSnapshot;
    expect(typeof fn).toBe('function');

    await fn!().catch(() => undefined);

    expect(mockReplaceAll).not.toHaveBeenCalled();
  });
});

// ═══ coverageCacheStorage.replaceAll — una sola transacción ══════════════════

describe('coverageCacheStorage.replaceAll — C13: atómico en SQLite', () => {
  it('borra y escribe dentro de db.transaction, nunca fuera de ella', async () => {
    const tx: Record<string, jest.Mock> = {};
    const chain = (): Record<string, jest.Mock> => {
      const c: Record<string, jest.Mock> = {};
      for (const m of ['where', 'values', 'onConflictDoUpdate', 'set']) c[m] = jest.fn(() => Promise.resolve(c));
      return c;
    };
    tx.delete = jest.fn(() => chain());
    tx.insert = jest.fn(() => chain());
    tx.update = jest.fn(() => chain());
    tx.run = jest.fn();
    const db = {
      transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
      delete: jest.fn(() => chain()),
      insert: jest.fn(() => chain()),
      update: jest.fn(() => chain()),
    };

    let storage: { replaceAll: (s: unknown, d?: Date) => Promise<void> } | undefined;
    jest.isolateModules(() => {
      jest.doMock('../storage/db/db', () => ({ db }));
      jest.dontMock('../storage/coverageCache');
      try {
        storage = jest.requireActual('../storage/coverageCache').coverageCacheStorage;
      } catch {
        storage = undefined;
      }
    });
    if (!storage) throw new Error('Spec 103 — el módulo ../storage/coverageCache todavía no existe');

    await storage.replaceAll(snapshot, new Date('2026-11-08T15:05:00.000Z'));

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.delete).toHaveBeenCalled();
    expect(tx.insert).toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
