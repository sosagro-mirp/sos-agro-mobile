// Spec 103 — ancla de la encuesta por productor (productor, finca o cultivo de
// finca), contexto por parámetros de ruta y regreso a la ficha. Funciones puras.

export type AnchorScopeLevel = 'farmer' | 'farm' | 'farm_crop';

export const DEFAULT_ENTRY_ROUTE = '/productores' as const;

export interface SurveyAnchor {
  farmerId: string;
  farmId?: string;
  farmCropId?: string;
}

export interface ApplyContext extends SurveyAnchor {
  scopeLevel?: AnchorScopeLevel;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_FARMER = /^local_farmer_.+/;
const LEVELS: AnchorScopeLevel[] = ['farmer', 'farm', 'farm_crop'];

export function buildSurveyAnchor(input: {
  scopeLevel: AnchorScopeLevel;
  farmerId: string;
  farmId?: string | null;
  farmCropId?: string | null;
}): SurveyAnchor {
  const { scopeLevel, farmerId, farmId, farmCropId } = input;
  if (scopeLevel === 'farmer') return { farmerId };
  if (!farmId) throw new Error('Falta la finca para anclar la encuesta');
  if (scopeLevel === 'farm') return { farmerId, farmId };
  if (!farmCropId) throw new Error('Falta el cultivo para anclar la encuesta');
  return { farmerId, farmId, farmCropId };
}

export function isAnchorComplete(anchor: {
  farmId?: string | null;
  farmCropId?: string | null;
}): boolean {
  return !(anchor.farmCropId && !anchor.farmId);
}

export function applyContextParams(ctx: ApplyContext): Record<string, string> {
  const params: Record<string, string> = { farmerId: ctx.farmerId };
  if (ctx.farmId) params.farmId = ctx.farmId;
  if (ctx.farmCropId) params.farmCropId = ctx.farmCropId;
  if (ctx.scopeLevel) params.scopeLevel = ctx.scopeLevel;
  return params;
}

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export function parseApplyContext(
  params: Record<string, string | string[] | undefined>,
): ApplyContext | null {
  const farmerId = first(params.farmerId);
  const farmId = first(params.farmId);
  const farmCropId = first(params.farmCropId);
  const scopeLevel = first(params.scopeLevel);

  if (!farmerId || !(UUID.test(farmerId) || LOCAL_FARMER.test(farmerId))) return null;
  if (farmId !== undefined && !UUID.test(farmId)) return null;
  if (farmCropId !== undefined && !UUID.test(farmCropId)) return null;
  if (farmCropId && !farmId) return null;
  if (scopeLevel !== undefined && !LEVELS.includes(scopeLevel as AnchorScopeLevel)) return null;

  const ctx: ApplyContext = { farmerId };
  if (farmId) ctx.farmId = farmId;
  if (farmCropId) ctx.farmCropId = farmCropId;
  if (scopeLevel) ctx.scopeLevel = scopeLevel as AnchorScopeLevel;
  return ctx;
}

export function applyContextFromDraft(draft: {
  campaignSessionId?: string;
  farmerId?: string;
  farmId?: string;
  farmCropId?: string;
}): ApplyContext | null {
  if (draft.campaignSessionId || !draft.farmerId) return null;
  const ctx: ApplyContext = { farmerId: draft.farmerId };
  if (draft.farmId) ctx.farmId = draft.farmId;
  if (draft.farmCropId) ctx.farmCropId = draft.farmCropId;
  return ctx;
}

export function returnPathAfterSurvey(input: {
  campaignId?: string | null;
  campaignSessionId?: string | null;
  farmerId?: string | null;
}): string {
  if (input.campaignId && input.campaignSessionId) {
    return `/campaign/${input.campaignId}/session/${input.campaignSessionId}/orchestrator`;
  }
  if (input.farmerId) return `/productores/${input.farmerId}`;
  return DEFAULT_ENTRY_ROUTE;
}
