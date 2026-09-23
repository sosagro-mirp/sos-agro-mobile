// Hallazgo de la ronda manual de test-086 (TC-086-11 y TC-086-14): al ingresar con
// conexión desde el selector, los pendientes del encuestador no salían hasta que
// otro disparo (reconexión, "Sincronizar ahora") corriera la cola.

jest.mock('../storage/secureStorage', () => ({
  secureStorage: {
    migrateLegacyToken: jest.fn(),
    getActiveUserId: jest.fn(),
    setActiveUserId: jest.fn(),
    clearActiveUserId: jest.fn(),
    getTokenFor: jest.fn(),
    saveTokenFor: jest.fn(),
    deleteTokenFor: jest.fn(),
    getToken: jest.fn(),
  },
}));
jest.mock('../storage/userStorage', () => ({
  userStorage: { getUser: jest.fn(), saveUser: jest.fn(), deleteUser: jest.fn() },
}));
jest.mock('../storage/offlineCredentialStorage', () => ({
  offlineCredentialStorage: {
    getCredential: jest.fn(),
    findByEmail: jest.fn(),
    saveCredential: jest.fn(),
    upsertKnownUser: jest.fn(),
    evictExcess: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../lib/offlineCredential', () => {
  const actual = jest.requireActual('../lib/offlineCredential');
  return { ...actual, createOfflineCredential: jest.fn().mockResolvedValue({ lastOnlineLoginAt: 0 }) };
});
jest.mock('../api/auth', () => ({ login: jest.fn(), me: jest.fn() }));

const mockProcessAll = jest.fn();
jest.mock('../sync/SyncQueueService', () => ({
  SyncQueueService: { processAll: (...args: unknown[]) => mockProcessAll(...args) },
}));
jest.mock('../store/useCampaignSessionStore', () => ({
  useCampaignSessionStore: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock('../store/useInstrumentSurveyStore', () => ({
  useInstrumentSurveyStore: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock('../storage/syncQueue', () => ({
  syncQueueStorage: {
    listPendingOwners: jest.fn().mockResolvedValue([]),
    countPending: jest.fn().mockResolvedValue(0),
  },
}));
jest.mock('../storage/mediaUploadQueueStorage', () => ({ mediaUploadQueueStorage: {} }));
jest.mock('../store/useDraftCountStore', () => ({
  useDraftCountStore: { getState: () => ({ refresh: jest.fn() }), setState: jest.fn() },
}));

import { login as apiLogin } from '../api/auth';
import { NetworkError } from '../api/httpClient';
import { useAuthStore } from '../store/useAuthStore';

const USER = {
  userId: 'a3f1c9d2-0000-4000-8000-00000000000a',
  name: 'Ana',
  lastName: 'Pérez',
  email: 'ana@sosagro.test',
  role: 'pollster',
  mustChangePassword: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ token: null, user: null, serverState: 'unknown', error: null });
});

describe('login con conexión lanza la sincronización', () => {
  it('tras un ingreso en línea exitoso corre la cola, con el token ya establecido', async () => {
    (apiLogin as jest.Mock).mockResolvedValue({ accessToken: 'tok', user: USER });
    mockProcessAll.mockImplementation(async () => {
      expect(useAuthStore.getState().token).toBe('tok');
    });

    await useAuthStore.getState().login(USER.email, 'clave');

    expect(mockProcessAll).toHaveBeenCalledTimes(1);
  });

  it('un ingreso que falla no dispara la cola', async () => {
    (apiLogin as jest.Mock).mockRejectedValue(new NetworkError());

    await useAuthStore.getState().login(USER.email, 'clave');

    expect(mockProcessAll).not.toHaveBeenCalled();
  });
});
