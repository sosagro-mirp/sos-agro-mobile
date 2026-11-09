// Spec 103 (C2) — búsqueda y filtros de la lista «Productores» sin conexión.
import type { CoverageSummary } from './coverageOverlay';

export interface CoverageListRow {
  farmerId: string;
  name: string;
  documentId: string | null;
  departmentId: string | null;
  townId: string | null;
  cropIds: string[];
  farmsCount: number;
  hasPendingConsent: boolean;
  summary: CoverageSummary;
  statusByInstrument: Record<string, 'aplicado' | 'parcial' | 'falta'>;
  warnings: ('sin_finca' | 'sin_cultivo' | 'encuestas_sin_ubicar')[];
  isProvisional: boolean;
}

export interface ProductorFilters {
  search?: string;
  departmentIds?: string[];
  townIds?: string[];
  cropIds?: string[];
  missingInstrumentId?: string | null;
  status?: 'completo' | 'con_pendientes' | 'sin_finca' | null;
}

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const hasPending = (r: CoverageListRow) => r.summary.pending + r.summary.partial > 0;

export function applyProductorFilters(
  rows: CoverageListRow[],
  f: ProductorFilters,
): CoverageListRow[] {
  const q = normalize(f.search ?? '');
  return rows.filter((r) => {
    if (q && !normalize(r.name).includes(q) && !(r.documentId ?? '').toLowerCase().includes(q)) {
      return false;
    }
    if (f.departmentIds?.length && !(r.departmentId && f.departmentIds.includes(r.departmentId))) {
      return false;
    }
    if (f.townIds?.length && !(r.townId && f.townIds.includes(r.townId))) return false;
    if (f.cropIds?.length && !r.cropIds.some((c) => f.cropIds!.includes(c))) return false;
    if (f.missingInstrumentId) {
      const s = r.statusByInstrument[f.missingInstrumentId];
      if (s !== 'falta' && s !== 'parcial') return false;
    }
    if (f.status === 'completo') {
      if (hasPending(r) || r.warnings.includes('sin_finca')) return false;
    } else if (f.status === 'con_pendientes') {
      if (!hasPending(r)) return false;
    } else if (f.status === 'sin_finca') {
      if (!r.warnings.includes('sin_finca')) return false;
    }
    return true;
  });
}

export function summarizeProductorCoverage(row: CoverageListRow) {
  const applied = row.summary.applied;
  const applicable = row.summary.applicable;
  return {
    applied,
    applicable,
    pending: row.summary.pending + row.summary.partial,
    label: `${applied} de ${applicable}`,
  };
}
