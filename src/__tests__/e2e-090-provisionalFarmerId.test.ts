/**
 * Spec 90 — El `farmerId` provisional no debe viajar al backend.
 *
 * Cubre los criterios 1, 2, 3 y 6 de
 * `spec/90_farmerid_provisional_en_materialize_survey.md`. Los criterios 4, 5 y
 * 7 (que ninguna encuesta quede condenada, la recuperación de las ya atascadas
 * y la entrega por OTA) se verifican en la ronda manual
 * `docs/testing/test-090-farmerid-provisional.md`.
 *
 * Escrito en rojo antes de crear `src/sync/resolveDraftFarmerId.ts`: hoy falla
 * entero porque ese módulo todavía no existe.
 *
 * La decisión se aísla en una función pura —igual que `planSessionRecovery` del
 * spec 88— para poder probarla sin base de datos ni red.
 */

import { resolveDraftFarmerId } from '../sync/resolveDraftFarmerId';
import { describeProvisionalFarmerRecovery } from '../lib/describeFailedSyncCause';

const REAL = 'd0fcfb80-68c7-43aa-b1f0-bafe47b14883';
const LOCAL = 'local_farmer_2f9c1d7e-1a2b-4c3d-9e8f-5a6b7c8d9e0f';

// La caché responde por id (para averiguar el documento del provisional) y por
// documento (para dar con el UUID real). Se simula con dos mapas.
const cache = (porId: Record<string, string>, porDocumento: Record<string, string>) => ({
  documentoDe: async (farmerId: string) => porId[farmerId] ?? null,
  idRealDe: async (documentId: string) => porDocumento[documentId] ?? null,
});

describe('resolveDraftFarmerId', () => {
  // ─── Criterio 1: el id provisional nunca viaja ────────────────────────────
  it('nunca devuelve un id provisional', async () => {
    const resultado = await resolveDraftFarmerId(LOCAL, cache({}, {}));
    expect(resultado).not.toBe(LOCAL);
    expect(resultado).toBeUndefined();
  });

  // ─── Criterio 2: si la caché lo sabe, se envía el UUID real ───────────────
  it('resuelve el UUID real por el documento del agricultor', async () => {
    const resultado = await resolveDraftFarmerId(
      LOCAL,
      cache({ [LOCAL]: '3525017' }, { '3525017': REAL }),
    );
    expect(resultado).toBe(REAL);
  });

  // ─── Criterio 3: si no lo sabe, se omite el campo ─────────────────────────
  it('omite el campo cuando la caché no conoce el documento', async () => {
    const resultado = await resolveDraftFarmerId(LOCAL, cache({ [LOCAL]: '3525017' }, {}));
    expect(resultado).toBeUndefined();
  });

  it('omite el campo cuando el provisional no tiene documento en la caché', async () => {
    const resultado = await resolveDraftFarmerId(LOCAL, cache({}, { '3525017': REAL }));
    expect(resultado).toBeUndefined();
  });

  it('nunca devuelve otro id local, aunque la caché lo asocie al documento', async () => {
    const otroLocal = 'local_farmer_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const resultado = await resolveDraftFarmerId(
      LOCAL,
      cache({ [LOCAL]: '3525017' }, { '3525017': otroLocal }),
    );
    expect(resultado).toBeUndefined();
  });

  // ─── Un id real se respeta tal cual ───────────────────────────────────────
  it('devuelve sin tocar un id que ya es un UUID', async () => {
    const resultado = await resolveDraftFarmerId(REAL, cache({}, {}));
    expect(resultado).toBe(REAL);
  });

  it('no consulta la caché cuando el id ya es real', async () => {
    const documentoDe = jest.fn();
    const idRealDe = jest.fn();
    await resolveDraftFarmerId(REAL, { documentoDe, idRealDe });
    expect(documentoDe).not.toHaveBeenCalled();
    expect(idRealDe).not.toHaveBeenCalled();
  });

  // ─── Borrador sin agricultor ──────────────────────────────────────────────
  it('devuelve undefined si el borrador no tiene agricultor', async () => {
    expect(await resolveDraftFarmerId(undefined, cache({}, {}))).toBeUndefined();
    expect(await resolveDraftFarmerId(null, cache({}, {}))).toBeUndefined();
  });

  // ─── La caché puede fallar: no debe tumbar el envío ───────────────────────
  it('omite el campo si la caché lanza, en vez de propagar el error', async () => {
    const rota = {
      documentoDe: async () => {
        throw new Error('SQLite caído');
      },
      idRealDe: async () => null,
    };
    await expect(resolveDraftFarmerId(LOCAL, rota)).resolves.toBeUndefined();
  });
});

// ─── Criterio 6: el encuestador ve una explicación, no el texto técnico ─────

describe('describeProvisionalFarmerRecovery', () => {
  it('reconoce el error del backend y lo explica en español', () => {
    const texto = describeProvisionalFarmerRecovery('farmerId must be a UUID');
    expect(texto).toBeTruthy();
    expect(texto).not.toMatch(/farmerId|UUID/);
  });

  it('devuelve null ante cualquier otro error', () => {
    expect(describeProvisionalFarmerRecovery('numeric_with_unit questions require both')).toBeNull();
    expect(describeProvisionalFarmerRecovery('Sesión de campaña local sin resolución posible')).toBeNull();
    expect(describeProvisionalFarmerRecovery(undefined)).toBeNull();
    expect(describeProvisionalFarmerRecovery(null)).toBeNull();
  });
});
