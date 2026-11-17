import { httpClient, type RequestOptions } from './httpClient';
import { endpoints } from './endpoints';

// Spec 103 — foto de cobertura (`toCoverageSnapshot` del backend).

export type ScopeLevel = 'farmer' | 'farm' | 'farm_crop';
export type CoverageStatus = 'aplicado' | 'parcial' | 'falta' | 'no_aplica';

export interface CoverageColumn {
  instrumentId: string;
  name: string;
  code: string | null;
  scopeLevel: ScopeLevel;
  cropIds: string[];
  coverageGroup: string | null;
  memberIds: string[];
}

export interface CoverageSummary {
  applicable: number;
  applied: number;
  partial: number;
  pending: number;
  notApplicable: number;
  instrumentsWithoutScope: number;
}

export interface SnapshotUnit {
  unitType: ScopeLevel;
  farmId?: string;
  farmCropId?: string;
  label: string;
  status: CoverageStatus;
  surveyId: string | null;
  surveyCount: number;
  outOfScope?: boolean;
  coveredByOtherFarmer?: boolean;
}

export interface SnapshotInstrument {
  instrumentId: string;
  status: Exclude<CoverageStatus, 'no_aplica'>;
  surveyCount: number;
  latestSurvey: {
    surveyId: string;
    createdAt: string;
    farmId: string | null;
    farmCropId: string | null;
    farmerId: string | null;
  } | null;
  units: SnapshotUnit[];
}

export interface SnapshotFarm {
  farmId: string;
  name: string;
  role: string | null;
  isPrimary: boolean;
  town: { townId: string; name: string } | null;
  crops: { farmCropId: string; cropId: string; name: string }[];
}

export type CoverageWarning = 'sin_finca' | 'sin_cultivo' | 'encuestas_sin_ubicar';

export interface SnapshotFarmer {
  farmerId: string;
  name: string;
  documentId: string | null;
  departmentId: string | null;
  departmentName?: string | null;
  townId: string | null;
  farmsCount: number;
  cropIds: string[];
  hasPendingConsent: boolean;
  summary: CoverageSummary;
  warnings: CoverageWarning[];
  farms: SnapshotFarm[];
  instruments: SnapshotInstrument[];
}

export interface CoverageSnapshot {
  computedAt: string;
  instruments: CoverageColumn[];
  farmers: SnapshotFarmer[];
}

export function fetchCoverageSnapshot(opts?: RequestOptions): Promise<CoverageSnapshot> {
  return httpClient.get<CoverageSnapshot>(endpoints.coverageSnapshot, opts);
}
