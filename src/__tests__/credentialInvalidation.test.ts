// Auditoría 46 (M2) — spec 86: el hash de la credencial sin conexión se calcula en
// segundo plano y puede no terminar. La credencial anterior debe invalidarse antes,
// y un usuario que ya está en el selector pero sin credencial no es "nunca ingresó".

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

const calls: string[] = [];
jest.mock('../storage/offlineCredentialStorage', () => ({
  offlineCredentialStorage: {
    getCredential: jest.fn(),
    findByEmail: jest.fn(),
    saveCredential: jest.fn(async () => { calls.push('save'); }),
    markRequiresOnlineLogin: jest.fn(async () => { calls.push('invalidate'); }),
    upsertKnownUser: jest.fn(),
    listKnownUsers: jest.fn(),
    evictExcess: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../lib/offlineCredential', () => {
  const actual = jest.requireActual('../lib/offlineCredential');
  return {
    ...actual,
    createOfflineCredential: jest.fn(async () => { calls.push('hash'); return { lastOnlineLoginAt: 0 }; }),
  };
});
jest.mock('../api/auth', () => ({ login: jest.fn(), me: jest.fn() }));
jest.mock('../sync/SyncQueueService', () => ({
  SyncQueueService: { processAll: jest.fn().mockResolvedValue(undefined) },
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
import { offlineCredentialStorage } from '../storage/offlineCredentialStorage';
import { useAuthStore } from '../store/useAuthStore';

const ocs = offlineCredentialStorage as unknown as Record<string, jest.Mock>;
const USER = {
  userId: 'a3f1c9d2-0000-4000-8000-00000000000a',
  name: 'Ana',
  lastName: 'Pérez',
  email: 'ana@sosagro.test',
  role: 'pollster',
  mustChangePassword: false,
};
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
  useAuthStore.setState({ token: null, user: null, serverState: 'unknown', error: null });
});

describe('spec86 / auditoría 46 M2', () => {
  it('invalida la credencial anterior antes de calcular el hash de la nueva', async () => {
    (apiLogin as jest.Mock).mockResolvedValue({ accessToken: 'tok', user: USER });

    await useAuthStore.getState().login(USER.email, 'clave-nueva');
    await flush();

    expect(calls.indexOf('invalidate')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('invalidate')).toBeLessThan(calls.indexOf('hash'));
    expect(calls.indexOf('hash')).toBeLessThan(calls.indexOf('save'));
    expect(ocs.markRequiresOnlineLogin).toHaveBeenCalledWith(USER.userId);
  });

  it('un usuario del selector sin credencial ve "se está preparando", no "nunca ingresó"', async () => {
    (apiLogin as jest.Mock).mockRejectedValue(new NetworkError());
    ocs.findByEmail.mockResolvedValue(null);
    ocs.listKnownUsers.mockResolvedValue([{ userId: USER.userId, email: 'ANA@sosagro.test' }]);

    await useAuthStore.getState().login(USER.email, 'clave');

    expect(useAuthStore.getState().error).toMatch(/se está preparando/);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('un usuario que nunca ingresó en la tablet sigue viendo el mensaje de primer ingreso', async () => {
    (apiLogin as jest.Mock).mockRejectedValue(new NetworkError());
    ocs.findByEmail.mockResolvedValue(null);
    ocs.listKnownUsers.mockResolvedValue([]);

    await useAuthStore.getState().login('otra@sosagro.test', 'clave');

    expect(useAuthStore.getState().error).toMatch(/todavía no ha ingresado/);
  });
});
