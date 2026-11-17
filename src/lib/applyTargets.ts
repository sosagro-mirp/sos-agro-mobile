// Spec 103 — acciones «Aplicar» / «Aplicar de nuevo» de la ficha offline (C4, C8, DM8).
import type { FarmerCoverageDetail, ScopeLevel } from './coverageOverlay';

export interface ApplyTarget {
  instrumentId: string;
  instrumentName: string;
  scopeLevel: ScopeLevel;
  farmId: string | null;
  farmCropId: string | null;
  label: string;
  status: 'falta' | 'parcial' | 'aplicado';
  localStatus: 'aplicado_local' | 'en_curso' | null;
  action: 'apply' | 'reapply' | 'none';
  blockedReason: 'sin_finca' | 'pendiente_sincronizar' | null;
  requiresReapplyConfirm: boolean;
  lastAppliedAt: string | null;
  coveredByOtherFarmer: boolean;
}

const isProvisional = (farmerId: string) => farmerId.startsWith('local_farmer_');

function latest(a: string | null | undefined, b: string | null | undefined): string | null {
  if (a && b) return a > b ? a : b;
  return a ?? b ?? null;
}

export function listApplyTargets(detail: FarmerCoverageDetail): ApplyTarget[] {
  const targets: ApplyTarget[] = [];
  const provisional = isProvisional(detail.farmerId);
  const noFarms = detail.farms.length === 0;

  for (const inst of detail.instruments) {
    if (inst.status === 'no_aplica') continue;

    if (inst.scopeLevel !== 'farmer' && (provisional || noFarms)) {
      targets.push({
        instrumentId: inst.instrumentId,
        instrumentName: inst.name,
        scopeLevel: inst.scopeLevel,
        farmId: null,
        farmCropId: null,
        label: inst.name,
        status: inst.status as ApplyTarget['status'],
        localStatus: null,
        action: 'none',
        blockedReason: provisional ? 'pendiente_sincronizar' : 'sin_finca',
        requiresReapplyConfirm: false,
        lastAppliedAt: null,
        coveredByOtherFarmer: false,
      });
      continue;
    }

    for (const unit of inst.units) {
      if (unit.status === 'no_aplica' || unit.outOfScope) continue;
      const applied = unit.status === 'aplicado';
      targets.push({
        instrumentId: inst.instrumentId,
        instrumentName: inst.name,
        scopeLevel: inst.scopeLevel,
        farmId: inst.scopeLevel === 'farmer' ? null : (unit.farmId ?? null),
        farmCropId: inst.scopeLevel === 'farm_crop' ? (unit.farmCropId ?? null) : null,
        label: unit.label,
        status: unit.status,
        localStatus: unit.localStatus ?? null,
        action: applied ? 'reapply' : 'apply',
        blockedReason: null,
        requiresReapplyConfirm: applied,
        lastAppliedAt: applied
          ? latest(inst.latestSurvey?.createdAt, unit.localAppliedAt)
          : null,
        coveredByOtherFarmer: !!unit.coveredByOtherFarmer,
      });
    }
  }

  const group = (t: ApplyTarget) => (t.action === 'apply' ? 0 : t.action === 'reapply' ? 1 : 2);
  return targets.sort(
    (a, b) =>
      group(a) - group(b) ||
      a.instrumentName.localeCompare(b.instrumentName, 'es') ||
      a.label.localeCompare(b.label, 'es'),
  );
}

export function blockedNotice(reason: 'sin_finca' | 'pendiente_sincronizar'): string {
  return reason === 'pendiente_sincronizar'
    ? 'Productor nuevo: este instrumento se habilita al sincronizar.'
    : 'El productor no tiene finca registrada: no se puede aplicar este instrumento.';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export function reapplyConfirmationText(target: ApplyTarget): string {
  let text = `«${target.instrumentName}» ya está aplicado`;
  if (target.lastAppliedAt) text += `; la última encuesta es del ${formatDate(target.lastAppliedAt)}`;
  text += '.';
  if (target.coveredByOtherFarmer) text += ' Lo cubrió otro productor de la misma finca.';
  return `${text} ¿Aplicarlo de nuevo?`;
}
