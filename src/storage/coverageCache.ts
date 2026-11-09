import { eq, notLike } from 'drizzle-orm';
import { db } from './db/db';
import { coverageSnapshot, farmerCoverageCache } from './db/schema';
import type { CoverageColumn, CoverageSnapshot } from '../api/coverage';
import {
  applyLocalOverlay,
  type CoverageInstrumentDetail,
  type CoverageSummary,
  type FarmerCoverageDetail,
  type LocalSurveyRef,
} from '../lib/coverageOverlay';
import type { CoverageListRow } from '../lib/productorFilters';
import { surveyDraftStore } from './surveyDraftStore';

// Spec 103 — foto de cobertura del servidor para el flujo por productor offline.
// El reemplazo es atómico (una transacción) y conserva los productores
// provisionales (`local_farmer_*`) que todavía no sincronizan.

const SNAPSHOT_ID = 'active';
const PROVISIONAL_PREFIX = 'local_farmer_';
const EMPTY_SUMMARY: CoverageSummary = {
  applicable: 0,
  applied: 0,
  partial: 0,
  pending: 0,
  notApplicable: 0,
  instrumentsWithoutScope: 0,
};

type StoredDetail = Pick<FarmerCoverageDetail, 'farms' | 'warnings'> & {
  departmentName?: string | null;
  instruments: (Omit<
    CoverageInstrumentDetail,
    'name' | 'code' | 'scopeLevel' | 'cropIds' | 'coverageGroup' | 'memberIds'
  >)[];
};

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function readColumns(): Promise<{ computedAt: string; downloadedAt: Date; columns: CoverageColumn[] } | null> {
  const row = await db.select().from(coverageSnapshot).where(eq(coverageSnapshot.id, SNAPSHOT_ID)).get();
  if (!row) return null;
  return { computedAt: row.computedAt, downloadedAt: row.downloadedAt, columns: parse<CoverageColumn[]>(row.columns, []) };
}

function buildDetail(
  row: typeof farmerCoverageCache.$inferSelect,
  columns: CoverageColumn[],
): FarmerCoverageDetail {
  const stored = parse<StoredDetail>(row.detail, { farms: [], warnings: [], instruments: [] });
  const byId = new Map(columns.map((c) => [c.instrumentId, c]));
  const instruments: CoverageInstrumentDetail[] = [];
  for (const i of stored.instruments) {
    const col = byId.get(i.instrumentId);
    if (!col) continue;
    instruments.push({
      ...i,
      name: col.name,
      code: col.code,
      scopeLevel: col.scopeLevel,
      cropIds: col.cropIds,
      coverageGroup: col.coverageGroup,
      memberIds: col.memberIds,
    });
  }
  return {
    farmerId: row.farmerId,
    name: row.name,
    documentId: row.documentId,
    departmentId: row.departmentId,
    townId: row.townId,
    farmsCount: row.farmsCount,
    cropIds: parse<string[]>(row.cropIds, []),
    hasPendingConsent: row.hasPendingConsent,
    computedAt: row.computedAt,
    summary: parse<CoverageSummary>(row.summary, EMPTY_SUMMARY),
    warnings: stored.warnings,
    farms: stored.farms,
    instruments,
  };
}

function toListRow(detail: FarmerCoverageDetail): CoverageListRow {
  const statusByInstrument: CoverageListRow['statusByInstrument'] = {};
  for (const i of detail.instruments) {
    if (i.status !== 'no_aplica') statusByInstrument[i.instrumentId] = i.status;
  }
  return {
    farmerId: detail.farmerId,
    name: detail.name,
    documentId: detail.documentId,
    departmentId: detail.departmentId,
    townId: detail.townId,
    cropIds: detail.cropIds,
    farmsCount: detail.farmsCount,
    hasPendingConsent: detail.hasPendingConsent,
    summary: detail.summary,
    statusByInstrument,
    warnings: detail.warnings,
    isProvisional: detail.farmerId.startsWith(PROVISIONAL_PREFIX),
  };
}

export const coverageCacheStorage = {
  /** Reemplaza la foto completa en una sola transacción; conserva los provisionales. */
  async replaceAll(snapshot: CoverageSnapshot, downloadedAt: Date = new Date()): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(coverageSnapshot);
      // Los provisionales (`local_farmer_*`) no están en la foto: se conservan.
      await tx.delete(farmerCoverageCache).where(notLike(farmerCoverageCache.farmerId, `${PROVISIONAL_PREFIX}%`));
      await tx.insert(coverageSnapshot).values({
        id: SNAPSHOT_ID,
        computedAt: snapshot.computedAt,
        downloadedAt,
        columns: JSON.stringify(snapshot.instruments),
      });
      for (const f of snapshot.farmers) {
        const stored: StoredDetail = {
          farms: f.farms,
          warnings: f.warnings,
          departmentName: f.departmentName ?? null,
          instruments: f.instruments,
        };
        await tx
          .insert(farmerCoverageCache)
          .values({
            farmerId: f.farmerId,
            name: f.name,
            documentId: f.documentId,
            departmentId: f.departmentId,
            townId: f.townId,
            cropIds: JSON.stringify(f.cropIds),
            farmsCount: f.farmsCount,
            hasPendingConsent: f.hasPendingConsent,
            summary: JSON.stringify(f.summary),
            detail: JSON.stringify(stored),
            computedAt: snapshot.computedAt,
          });
      }
    });
  },

  getSnapshotMeta: readColumns,

  /** Filas de la lista con la superposición local ya aplicada. */
  async list(): Promise<CoverageListRow[]> {
    const meta = await readColumns();
    const rows = await db.select().from(farmerCoverageCache).all();
    const local = await surveyDraftStore.listForCoverage();
    const columns = meta?.columns ?? [];
    return rows
      .map((r) => buildDetail(r, columns))
      .map((d) => (local.length ? applyLocalOverlay(d, local as LocalSurveyRef[]) : d))
      .map(toListRow)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  },

  async getDetail(farmerId: string): Promise<FarmerCoverageDetail | null> {
    const meta = await readColumns();
    const row = await db.select().from(farmerCoverageCache).where(eq(farmerCoverageCache.farmerId, farmerId)).get();
    if (!row) return null;
    const detail = buildDetail(row, meta?.columns ?? []);
    const local = await surveyDraftStore.listForCoverage();
    return local.length ? applyLocalOverlay(detail, local as LocalSurveyRef[]) : detail;
  },

  /** Opciones de los filtros de la lista, con nombres, sacadas de la foto guardada. */
  async getFilterOptions(): Promise<{
    departments: { id: string; name: string }[];
    towns: { id: string; name: string }[];
    crops: { id: string; name: string }[];
    instruments: { id: string; name: string }[];
  }> {
    const meta = await readColumns();
    const rows = await db.select().from(farmerCoverageCache).all();
    const departments = new Map<string, string>();
    const towns = new Map<string, string>();
    const crops = new Map<string, string>();
    for (const r of rows) {
      const stored = parse<StoredDetail>(r.detail, { farms: [], warnings: [], instruments: [] });
      if (r.departmentId && stored.departmentName) departments.set(r.departmentId, stored.departmentName);
      for (const f of stored.farms) {
        if (f.town) towns.set(f.town.townId, f.town.name);
        for (const c of f.crops) crops.set(c.cropId, c.name);
      }
    }
    const sorted = (m: Map<string, string>) =>
      [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return {
      departments: sorted(departments),
      towns: sorted(towns),
      crops: sorted(crops),
      instruments: (meta?.columns ?? [])
        .map((c) => ({ id: c.instrumentId, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    };
  },

  /** Productor registrado sin conexión: solo cobertura de nivel productor hasta sincronizar (DM8). */
  async addProvisional(farmer: { farmerId: string; name: string; documentId: string | null }): Promise<void> {
    const meta = await readColumns();
    const instruments = (meta?.columns ?? [])
      .filter((c) => c.scopeLevel === 'farmer')
      .map((c) => ({
        instrumentId: c.instrumentId,
        status: 'falta' as const,
        surveyCount: 0,
        latestSurvey: null,
        units: [
          { unitType: 'farmer' as const, label: farmer.name, status: 'falta' as const, surveyId: null, surveyCount: 0 },
        ],
      }));
    const summary: CoverageSummary = {
      ...EMPTY_SUMMARY,
      applicable: instruments.length,
      pending: instruments.length,
    };
    const stored: StoredDetail = { farms: [], warnings: ['sin_finca'], instruments };
    await db
      .insert(farmerCoverageCache)
      .values({
        farmerId: farmer.farmerId,
        name: farmer.name,
        documentId: farmer.documentId,
        departmentId: null,
        townId: null,
        cropIds: '[]',
        farmsCount: 0,
        hasPendingConsent: true,
        summary: JSON.stringify(summary),
        detail: JSON.stringify(stored),
        computedAt: meta?.computedAt ?? new Date().toISOString(),
      })
      .onConflictDoNothing();
  },

  /** Cambia el id provisional por el real al resolverse la identidad en el backend. */
  async remapFarmer(localFarmerId: string, realFarmerId: string): Promise<void> {
    const real = await db.select().from(farmerCoverageCache).where(eq(farmerCoverageCache.farmerId, realFarmerId)).get();
    if (real) {
      await db.delete(farmerCoverageCache).where(eq(farmerCoverageCache.farmerId, localFarmerId));
      return;
    }
    await db
      .update(farmerCoverageCache)
      .set({ farmerId: realFarmerId })
      .where(eq(farmerCoverageCache.farmerId, localFarmerId));
  },
};
