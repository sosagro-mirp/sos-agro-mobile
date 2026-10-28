/**
 * Spec 68, Fase 10 — retomar un Registro cuya colisión de documento quedó sin
 * resolver (TC-068-09). Cubre la lógica pura del marcador local; el flujo
 * completo (tarjeta → orquestador → aviso) lo cubre la prueba manual.
 */
jest.mock('../storage/pendingSessions', () => ({
  pendingSessionStorage: { getByLocal: jest.fn() },
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

import { resolveResumeSessionId } from '../lib/resolveResumeSessionId';
import { pendingSessionStorage } from '../storage/pendingSessions';
import {
  filterForCampaign,
  pendingCollisionStorage,
  removeEntries,
  upsertEntry,
  type PendingCollisionEntry,
} from '../storage/pendingCollisionStorage';

const entry = (over: Partial<PendingCollisionEntry> = {}): PendingCollisionEntry => ({
  surveyId: 'survey-1',
  phase: 'registro',
  sessionId: 'session-1',
  campaignId: 'camp-1',
  userId: 'user-1',
  documentId: '9000680001',
  submittedName: 'Karol',
  createdAt: 1,
  ...over,
});

describe('pendingCollision — funciones puras', () => {
  it('upsert reemplaza por surveyId en vez de duplicar', () => {
    const list = upsertEntry([entry()], entry({ documentId: '9000680002', createdAt: 2 }));
    expect(list).toHaveLength(1);
    expect(list[0].documentId).toBe('9000680002');
  });

  it('upsert conserva solo las 5 más recientes (cabe en el límite de 2 KB de SecureStore)', () => {
    let list: PendingCollisionEntry[] = [];
    for (let i = 0; i < 8; i++) list = upsertEntry(list, entry({ surveyId: `s${i}`, createdAt: i }));
    expect(list).toHaveLength(5);
    expect(list.some((e) => e.surveyId === 's0')).toBe(false);
    expect(list.some((e) => e.surveyId === 's7')).toBe(true);
    expect(JSON.stringify(list).length).toBeLessThan(2048);
  });

  it('removeEntries ignora ids nulos y quita los indicados', () => {
    const list = [entry(), entry({ surveyId: 'survey-2' })];
    expect(removeEntries(list, [null, undefined, 'survey-1']).map((e) => e.surveyId)).toEqual(['survey-2']);
  });

  it('filterForCampaign aísla por campaña y por encuestador', () => {
    const list = [
      entry(),
      entry({ surveyId: 'b', campaignId: 'camp-2' }),
      entry({ surveyId: 'c', userId: 'user-2' }),
    ];
    expect(filterForCampaign(list, 'camp-1', 'user-1').map((e) => e.surveyId)).toEqual(['survey-1']);
  });
});

describe('pendingCollisionStorage', () => {
  it('add → listFor → remove', async () => {
    await pendingCollisionStorage.add(entry());
    expect(await pendingCollisionStorage.listFor('camp-1', 'user-1')).toHaveLength(1);
    expect(await pendingCollisionStorage.listFor('camp-1', 'user-2')).toHaveLength(0);
    await pendingCollisionStorage.remove('user-1', 'survey-1');
    expect(await pendingCollisionStorage.listFor('camp-1', 'user-1')).toHaveLength(0);
  });

  it('ignora entradas corruptas en lugar de fallar', async () => {
    const SecureStore = jest.requireMock('expo-secure-store');
    await SecureStore.setItemAsync('sosagro_pending_document_collisions', '[{"x":1}, 5]');
    expect(await pendingCollisionStorage.listFor('camp-1', 'user-1')).toEqual([]);
  });
});

describe('pendingCollisionStorage — tablet compartida', () => {
  it('cada encuestador tiene su lista: uno no desaloja ni ve los marcadores del otro', async () => {
    for (let i = 0; i < 6; i++) {
      await pendingCollisionStorage.add(entry({ surveyId: `a${i}`, createdAt: i }));
    }
    await pendingCollisionStorage.add(entry({ surveyId: 'b0', userId: 'user-2' }));
    expect(await pendingCollisionStorage.listFor('camp-1', 'user-1')).toHaveLength(5);
    expect(await pendingCollisionStorage.listFor('camp-1', 'user-2')).toHaveLength(1);
  });

  it('clearFor (forgetDevice) borra solo los marcadores de ese encuestador', async () => {
    await pendingCollisionStorage.add(entry({ surveyId: 'x1' }));
    await pendingCollisionStorage.add(entry({ surveyId: 'x2', userId: 'user-3' }));
    await pendingCollisionStorage.clearFor('user-1');
    expect(await pendingCollisionStorage.listFor('camp-1', 'user-1')).toEqual([]);
    expect(await pendingCollisionStorage.listFor('camp-1', 'user-3')).toHaveLength(1);
  });
});

describe('resolveResumeSessionId', () => {
  const getByLocal = pendingSessionStorage.getByLocal as jest.Mock;
  beforeEach(() => getByLocal.mockReset());

  it('deja intacto un id de sesión real', async () => {
    expect(await resolveResumeSessionId('9a1b2c3d-0000-4000-8000-000000000001')).toBe(
      '9a1b2c3d-0000-4000-8000-000000000001',
    );
    expect(getByLocal).not.toHaveBeenCalled();
  });

  it('traduce un id local al real si la sesión ya se sincronizó', async () => {
    getByLocal.mockResolvedValue({ realSessionId: 'real-1' });
    expect(await resolveResumeSessionId('local_session_1')).toBe('real-1');
  });

  it('conserva el id local si la sesión sigue pendiente o no se encuentra', async () => {
    getByLocal.mockResolvedValueOnce({ realSessionId: undefined });
    expect(await resolveResumeSessionId('local_session_1')).toBe('local_session_1');
    getByLocal.mockRejectedValueOnce(new Error('db'));
    expect(await resolveResumeSessionId('local_session_1')).toBe('local_session_1');
  });
});

describe('handleCorrectDocument — sin dependencia de red (TC-068-07)', () => {
  // Guarda de regresión estática: el orquestador es una pantalla y no se monta
  // en Jest. Lo que rompía TC-068-07 era que este handler pedía el instrumento
  // por HTTP (`fetchInstrumentByCode`, sin caché) y sin conexión fallaba con
  // "Sin conexión". Debe leer el id del borrador local y el instrumento de la caché.
  it('no llama a fetchInstrumentByCode dentro del handler de corrección', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../app/campaign/[id]/session/[sessionId]/orchestrator.tsx'),
      'utf8',
    );
    const start = src.indexOf('const handleCorrectDocument = useCallback');
    const end = src.indexOf('const resolveDocumentCollision', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    expect(body).not.toContain('fetchInstrumentByCode(');
    expect(body).toContain('draft.instrumentId');
  });
});
