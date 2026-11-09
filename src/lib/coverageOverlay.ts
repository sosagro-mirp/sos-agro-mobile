// Spec 103 (DM5) — superposición local de lo aplicado en el dispositivo sobre la
// foto de cobertura del servidor. Funciones puras, sin acceso a SQLite.

export type CoverageStatus = 'aplicado' | 'parcial' | 'falta' | 'no_aplica';
export type ScopeLevel = 'farmer' | 'farm' | 'farm_crop';

export interface CoverageUnitDetail {
  unitType: ScopeLevel;
  farmId?: string;
  farmCropId?: string;
  label: string;
  status: CoverageStatus;
  surveyId: string | null;
  surveyCount: number;
  outOfScope?: boolean;
  coveredByOtherFarmer?: boolean;
  localStatus?: 'aplicado_local' | 'en_curso';
  localAppliedAt?: string;
}

export interface CoverageInstrumentDetail {
  instrumentId: string;
  name: string;
  code: string | null;
  scopeLevel: ScopeLevel;
  cropIds: string[];
  coverageGroup: string | null;
  memberIds: string[];
  status: CoverageStatus;
  surveyCount: number;
  latestSurvey: {
    surveyId: string;
    createdAt: string;
    farmId: string | null;
    farmCropId: string | null;
    farmerId: string | null;
  } | null;
  units: CoverageUnitDetail[];
}

export interface CoverageSummary {
  applicable: number;
  applied: number;
  partial: number;
  pending: number;
  notApplicable: number;
  instrumentsWithoutScope: number;
}

export interface FarmerCoverageDetail {
  farmerId: string;
  name: string;
  documentId: string | null;
  departmentId: string | null;
  townId: string | null;
  farmsCount: number;
  cropIds: string[];
  hasPendingConsent: boolean;
  computedAt: string;
  summary: CoverageSummary;
  warnings: ('sin_finca' | 'sin_cultivo' | 'encuestas_sin_ubicar')[];
  farms: {
    farmId: string;
    name: string;
    role: string | null;
    isPrimary: boolean;
    town: { townId: string; name: string } | null;
    crops: { farmCropId: string; cropId: string; name: string }[];
  }[];
  instruments: CoverageInstrumentDetail[];
}

export interface LocalSurveyRef {
  localSurveyId: string;
  backendSurveyId: string | null;
  instrumentId: string;
  farmerId: string | null;
  farmId: string | null;
  farmCropId: string | null;
  status: 'draft' | 'completed' | 'synced';
  updatedAt: string;
}

/** Misma regla que `farmer-coverage-calculator.ts` del backend. */
export function aggregate(statuses: CoverageStatus[]): CoverageStatus {
  const applicable = statuses.filter((s) => s !== 'no_aplica');
  if (applicable.length === 0) return 'no_aplica';
  if (applicable.every((s) => s === 'aplicado')) return 'aplicado';
  if (applicable.every((s) => s === 'falta')) return 'falta';
  return 'parcial';
}

function matchesUnit(
  level: ScopeLevel,
  unit: CoverageUnitDetail,
  local: LocalSurveyRef,
  farmerId: string,
): boolean {
  if (level === 'farmer') return unit.unitType === 'farmer' && local.farmerId === farmerId;
  if (level === 'farm') return !!local.farmId && unit.farmId === local.farmId;
  return !!local.farmCropId && unit.farmCropId === local.farmCropId;
}

export function applyLocalOverlay(
  detail: FarmerCoverageDetail,
  localSurveys: LocalSurveyRef[],
): FarmerCoverageDetail {
  const out: FarmerCoverageDetail = JSON.parse(JSON.stringify(detail));

  // Encuestas que la foto ya incluye: no se cuentan dos veces.
  const inSnapshot = new Set<string>();
  for (const inst of out.instruments) {
    if (inst.latestSurvey) inChild(inst.latestSurvey.surveyId);
    for (const u of inst.units) if (u.surveyId) inChild(u.surveyId);
  }
  function inChild(id: string) {
    inSnapshot.add(id);
  }

  const pending = localSurveys.filter(
    (l) => !(l.backendSurveyId && inSnapshot.has(l.backendSurveyId)),
  );
  if (pending.length === 0) return out;

  for (const inst of out.instruments) {
    if (inst.status === 'no_aplica') continue;
    const ids = new Set([inst.instrumentId, ...inst.memberIds]);
    let touched = 0;
    for (const local of pending) {
      if (!ids.has(local.instrumentId)) continue;
      for (const unit of inst.units) {
        if (unit.status === 'no_aplica' || unit.outOfScope) continue;
        if (!matchesUnit(inst.scopeLevel, unit, local, out.farmerId)) continue;
        if (inst.scopeLevel !== 'farmer' && local.farmerId && local.farmerId !== out.farmerId) {
          unit.coveredByOtherFarmer = true;
        }
        if (local.status === 'draft') {
          if (unit.localStatus !== 'aplicado_local') unit.localStatus = 'en_curso';
          continue;
        }
        unit.status = 'aplicado';
        unit.localStatus = 'aplicado_local';
        if (!unit.localAppliedAt || local.updatedAt > unit.localAppliedAt) {
          unit.localAppliedAt = local.updatedAt;
        }
        unit.surveyCount += 1;
        touched += 1;
      }
    }
    if (touched > 0) {
      inst.surveyCount += touched;
      inst.status = aggregate(inst.units.map((u) => u.status));
    }
  }

  let applied = 0;
  let partial = 0;
  let pend = 0;
  for (const inst of out.instruments) {
    if (inst.status === 'aplicado') applied += 1;
    else if (inst.status === 'parcial') partial += 1;
    else if (inst.status === 'falta') pend += 1;
  }
  out.summary = {
    ...out.summary,
    applied,
    partial,
    pending: pend,
    applicable: applied + partial + pend,
  };
  return out;
}
