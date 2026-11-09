/**
 * Spec 104 — Retiro de campañas (H8), etapa A: borradores de campaña heredados
 * y pestaña «Campañas» oculta. Cubre C12 de `spec/104_retiro_de_campanas.md`
 * (DH8-4: los borradores ya iniciados se dejan terminar).
 *
 * ARRANCA EN ROJO: `src/lib/legacyCampaignDraft.ts` no existe y la pestaña
 * `campaign/index` sigue visible en `app/(tabs)/_layout.tsx`.
 *
 * ── Contrato ────────────────────────────────────────────────────────────────
 *   // src/lib/legacyCampaignDraft.ts
 *   export type LegacyDraftResume =
 *     | { kind: 'anchored'; instrumentId: string; surveyId: string;
 *         context: ApplyContext;            // de ./surveyAnchor
 *         campaignSessionId: string;        // se conserva: la ingesta heredada
 *                                           // sigue enviándolo hasta la etapa C
 *         returnTo: string }                // `/productores/{farmerId}`
 *     | { kind: 'orchestrator'; campaignSessionId: string };
 *
 *   export function resolveLegacyDraftResume(
 *     draft: { surveyId: string; instrumentId: string;
 *              campaignSessionId?: string | null; farmerId?: string | null;
 *              farmId?: string | null; farmCropId?: string | null },
 *     session?: { farmerId?: string | null } | null,
 *   ): LegacyDraftResume | null;
 *     - Sin `campaignSessionId` → null (no es un borrador heredado; lo maneja
 *       `applyContextFromDraft` del 103).
 *     - Con sesión y productor (`draft.farmerId` o, si falta, `session.farmerId`)
 *       → 'anchored'. Finca y cultivo solo si vienen en el borrador y forman un
 *       ancla completa (un cultivo sin finca se descarta).
 *     - Con sesión y sin productor → 'orchestrator' (se conserva hasta la etapa C).
 */
import * as fs from 'fs';
import * as path from 'path';

type ApplyContext = { farmerId: string; farmId?: string; farmCropId?: string };
type LegacyDraftResume =
  | {
      kind: 'anchored';
      instrumentId: string;
      surveyId: string;
      context: ApplyContext;
      campaignSessionId: string;
      returnTo: string;
    }
  | { kind: 'orchestrator'; campaignSessionId: string };
type Resolver = (
  draft: {
    surveyId: string;
    instrumentId: string;
    campaignSessionId?: string | null;
    farmerId?: string | null;
    farmId?: string | null;
    farmCropId?: string | null;
  },
  session?: { farmerId?: string | null } | null,
) => LegacyDraftResume | null;

function loadResolver(): Resolver {
  const rel = '../lib/legacyCampaignDraft';
  const base = path.resolve(__dirname, rel);
  if (!['.ts', '.tsx'].some((ext) => fs.existsSync(base + ext))) {
    throw new Error('Spec 104 — src/lib/legacyCampaignDraft.ts todavía no existe');
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require(rel) as { resolveLegacyDraftResume: Resolver }).resolveLegacyDraftResume;
}

const FARMER = '11111111-1111-4111-8111-111111111111';
const FARM = '22222222-2222-4222-8222-222222222222';
const FARM_CROP = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const base = { surveyId: 'local-survey-1', instrumentId: 'i-1' };

describe('Spec 104 — C12: resolveLegacyDraftResume', () => {
  it('un borrador sin sesión de campaña no es heredado', () => {
    expect(loadResolver()({ ...base, farmerId: FARMER })).toBeNull();
  });

  it('un borrador de campaña con productor se reanuda anclado y vuelve a la ficha', () => {
    const result = loadResolver()({
      ...base,
      campaignSessionId: SESSION,
      farmerId: FARMER,
      farmId: FARM,
      farmCropId: FARM_CROP,
    });
    expect(result).toEqual({
      kind: 'anchored',
      instrumentId: 'i-1',
      surveyId: 'local-survey-1',
      context: { farmerId: FARMER, farmId: FARM, farmCropId: FARM_CROP },
      campaignSessionId: SESSION,
      returnTo: `/productores/${FARMER}`,
    });
  });

  it('toma el productor de la sesión cuando el borrador no lo tiene', () => {
    const result = loadResolver()(
      { ...base, campaignSessionId: SESSION },
      { farmerId: FARMER },
    );
    expect(result).toMatchObject({
      kind: 'anchored',
      context: { farmerId: FARMER },
      returnTo: `/productores/${FARMER}`,
    });
  });

  it('descarta un cultivo sin finca (ancla incompleta)', () => {
    const result = loadResolver()({
      ...base,
      campaignSessionId: SESSION,
      farmerId: FARMER,
      farmCropId: FARM_CROP,
    });
    expect(result).toMatchObject({ kind: 'anchored', context: { farmerId: FARMER } });
    expect((result as { context: ApplyContext }).context.farmCropId).toBeUndefined();
  });

  it('sin productor ni en el borrador ni en la sesión, sigue por el orquestador', () => {
    expect(
      loadResolver()({ ...base, campaignSessionId: SESSION }, { farmerId: null }),
    ).toEqual({ kind: 'orchestrator', campaignSessionId: SESSION });
  });
});

describe('Spec 104 — C12: la pestaña «Campañas» está oculta', () => {
  it('la pantalla campaign/index se declara con href: null', () => {
    const layout = fs.readFileSync(
      path.resolve(__dirname, '../../app/(tabs)/_layout.tsx'),
      'utf8',
    );
    const start = layout.indexOf('name="campaign/index"');
    expect(start).toBeGreaterThan(-1);
    const block = layout.slice(start, layout.indexOf('/>', start));
    expect(block).toMatch(/href:\s*null/);
  });
});
