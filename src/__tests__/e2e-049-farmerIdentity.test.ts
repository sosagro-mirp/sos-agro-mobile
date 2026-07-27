/**
 * Spec 49 — Bug B: persistencia de la identidad del agricultor.
 *
 * Cubre los criterios de aceptación 6 y 7 de
 * `spec/49_correccion_identidad_offline_agricultor_cultivos.md`.
 *
 * ARRANCA EN ROJO: `src/lib/cacheFarmerIdentity.ts` todavía no existe (Fase 2).
 *
 * Contexto del bug: cuando la identificación S1 ocurre ONLINE,
 * `orchestrator.tsx:238-243` obtiene el farmerId real del backend vía
 * `extractFarmer()` pero nunca lo persiste en `farmerCacheStorage`. Al
 * re-encuestar al mismo agricultor OFFLINE, `extractFarmerLocally` no lo
 * encuentra por documentId y genera un farmerId local provisional nuevo, así
 * que la detección de duplicados compara IDs distintos para la misma persona.
 *
 * Estos casos fijan el contrato de la función compartida que ambas ramas
 * (online y offline) deben usar para cachear la identidad.
 */

jest.mock('../storage/farmerCache', () => ({
  farmerCacheStorage: { upsert: jest.fn() },
}));

jest.mock('../lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { cacheFarmerIdentity } from '../lib/cacheFarmerIdentity';
import { farmerCacheStorage } from '../storage/farmerCache';
import { logger } from '../lib/logger';

const mockUpsert = farmerCacheStorage.upsert as jest.Mock;
const mockWarn = logger.warn as jest.Mock;

/** Forma en la que `extractFarmer()` devuelve al agricultor desde el backend. */
const BACKEND_FARMER = {
  farmerId: 'a3f1c9d2-0000-4000-8000-000000000001',
  name: 'María Restrepo',
  documentId: '1094567890',
  phone: '3001234567',
  farmName: 'La Esperanza',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue(undefined);
});

describe('spec49 / Bug B — cacheFarmerIdentity', () => {
  // Criterio 6
  it('persiste el farmerId real y el documentId en farmerCacheStorage', async () => {
    await cacheFarmerIdentity(BACKEND_FARMER);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        farmerId: BACKEND_FARMER.farmerId,
        name: BACKEND_FARMER.name,
        documentId: BACKEND_FARMER.documentId,
      }),
    );
  });

  // Criterio 6 — el documentId es la llave con la que extractFarmerLocally
  // resuelve la identidad offline; sin él el cacheo no sirve para nada.
  it('persiste phone y farmName cuando el backend los devuelve', async () => {
    await cacheFarmerIdentity(BACKEND_FARMER);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: BACKEND_FARMER.phone,
        farmName: BACKEND_FARMER.farmName,
      }),
    );
  });

  it('acepta null en los campos opcionales sin propagarlos como null a la caché', async () => {
    await cacheFarmerIdentity({
      farmerId: BACKEND_FARMER.farmerId,
      name: BACKEND_FARMER.name,
      documentId: null,
      phone: null,
      farmName: null,
    });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const entry = mockUpsert.mock.calls[0][0];
    expect(entry.documentId ?? undefined).toBeUndefined();
    expect(entry.phone ?? undefined).toBeUndefined();
    expect(entry.farmName ?? undefined).toBeUndefined();
  });

  it('incluye cachedAt en la entrada persistida', async () => {
    await cacheFarmerIdentity(BACKEND_FARMER);

    const entry = mockUpsert.mock.calls[0][0];
    expect(entry.cachedAt).toBeInstanceOf(Date);
  });

  // Un fallo de caché no puede tumbar el flujo de encuesta: el encuestador
  // está en campo y perder la sesión es peor que perder el cacheo.
  it('no lanza si el upsert falla, y registra el fallo', async () => {
    mockUpsert.mockRejectedValue(new Error('SQLITE_BUSY'));

    await expect(cacheFarmerIdentity(BACKEND_FARMER)).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalled();
  });

  // Se llama desde la rama online justo después de extractFarmer(); si por
  // cualquier razón el backend no devolvió un id usable, no hay que ensuciar
  // la caché con una entrada inservible.
  it('no persiste nada si el farmerId viene vacío', async () => {
    await cacheFarmerIdentity({ farmerId: '', name: BACKEND_FARMER.name });

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  // Criterio 7 — idempotencia: re-identificar al mismo agricultor no duplica
  // ni falla; el upsert de farmerCacheStorage resuelve el conflicto por PK.
  it('es idempotente: dos llamadas con el mismo farmerId no fallan', async () => {
    await cacheFarmerIdentity(BACKEND_FARMER);
    await cacheFarmerIdentity(BACKEND_FARMER);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockWarn).not.toHaveBeenCalled();
  });
});
