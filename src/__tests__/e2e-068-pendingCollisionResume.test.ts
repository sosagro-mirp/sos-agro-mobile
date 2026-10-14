/**
 * Spec 68, Fase 10 — retomar un Registro cuya colisión de documento quedó sin
 * resolver (TC-068-09). Cubre la lógica pura del marcador local; el flujo
 * completo (tarjeta → orquestador → aviso) lo cubre la prueba manual.
 */
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

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

  it('upsert conserva solo las 10 más recientes', () => {
    let list: PendingCollisionEntry[] = [];
    for (let i = 0; i < 12; i++) list = upsertEntry(list, entry({ surveyId: `s${i}`, createdAt: i }));
    expect(list).toHaveLength(10);
    expect(list.some((e) => e.surveyId === 's0')).toBe(false);
    expect(list.some((e) => e.surveyId === 's11')).toBe(true);
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
    await pendingCollisionStorage.remove('survey-1');
    expect(await pendingCollisionStorage.listFor('camp-1', 'user-1')).toHaveLength(0);
  });

  it('ignora entradas corruptas en lugar de fallar', async () => {
    const SecureStore = jest.requireMock('expo-secure-store');
    await SecureStore.setItemAsync('sosagro_pending_document_collisions', '[{"x":1}, 5]');
    expect(await pendingCollisionStorage.listFor('camp-1', 'user-1')).toEqual([]);
  });
});
