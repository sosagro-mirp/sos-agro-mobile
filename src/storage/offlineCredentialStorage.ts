import * as SecureStore from "expo-secure-store";
import {
  parseStoredCredential,
  selectUsersToEvict,
  type OfflineCredential,
} from "../lib/offlineCredential";

// Spec 86 (C, D7): una credencial cifrada por usuario más un índice NO secreto
// para el selector de "¿Quién va a encuestar?". Mismo patrón que
// `userStorage.ts`: SecureStore, JSON corrupto = ausente, nunca lanza al leer.
const KNOWN_USERS_KEY = "sosagro_known_users";
const credentialKey = (userId: string) => `sosagro_offline_cred_${userId}`;

export interface KnownUser {
  userId: string;
  name: string;
  lastName: string;
  email: string;
  /** Último ingreso con conexión (ms). */
  lastOnlineLoginAt: number;
}

function parseKnownUsers(raw: string | null): KnownUser[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (u): u is KnownUser =>
        typeof u === "object" &&
        u !== null &&
        typeof (u as KnownUser).userId === "string" &&
        typeof (u as KnownUser).email === "string" &&
        typeof (u as KnownUser).lastOnlineLoginAt === "number",
    );
  } catch {
    return [];
  }
}

export const offlineCredentialStorage = {
  async getCredential(userId: string): Promise<OfflineCredential | null> {
    try {
      return parseStoredCredential(await SecureStore.getItemAsync(credentialKey(userId)));
    } catch {
      return null;
    }
  },

  saveCredential: (cred: OfflineCredential) =>
    SecureStore.setItemAsync(credentialKey(cred.userId), JSON.stringify(cred)),

  deleteCredential: (userId: string) => SecureStore.deleteItemAsync(credentialKey(userId)),

  async listKnownUsers(): Promise<KnownUser[]> {
    try {
      return parseKnownUsers(await SecureStore.getItemAsync(KNOWN_USERS_KEY));
    } catch {
      return [];
    }
  },

  /** Busca por email (sin distinguir mayúsculas) entre los usuarios conocidos. */
  async findByEmail(email: string): Promise<OfflineCredential | null> {
    const normalized = email.trim().toLowerCase();
    const known = await offlineCredentialStorage.listKnownUsers();
    const match = known.find((u) => u.email.trim().toLowerCase() === normalized);
    return match ? offlineCredentialStorage.getCredential(match.userId) : null;
  },

  async upsertKnownUser(user: KnownUser): Promise<void> {
    const known = await offlineCredentialStorage.listKnownUsers();
    const next = [...known.filter((u) => u.userId !== user.userId), user];
    await SecureStore.setItemAsync(KNOWN_USERS_KEY, JSON.stringify(next));
  },

  async removeKnownUser(userId: string): Promise<void> {
    const known = await offlineCredentialStorage.listKnownUsers();
    await SecureStore.setItemAsync(
      KNOWN_USERS_KEY,
      JSON.stringify(known.filter((u) => u.userId !== userId)),
    );
  },

  /** Obliga a que el próximo ingreso de este usuario sea con conexión. */
  async markRequiresOnlineLogin(userId: string): Promise<void> {
    const cred = await offlineCredentialStorage.getCredential(userId);
    if (!cred || cred.requiresOnlineLogin) return;
    await offlineCredentialStorage.saveCredential({ ...cred, requiresOnlineLogin: true });
  },

  /**
   * Con más de `MAX_KNOWN_USERS` usuarios, quita del índice y borra la
   * credencial de los más antiguos sin pendientes. Devuelve los ids retirados
   * para que quien llama borre también sus tokens.
   */
  async evictExcess(ownersWithPending: Set<string>): Promise<string[]> {
    const known = await offlineCredentialStorage.listKnownUsers();
    const evicted = selectUsersToEvict(known, ownersWithPending);
    for (const userId of evicted) {
      await offlineCredentialStorage.deleteCredential(userId);
      await offlineCredentialStorage.removeKnownUser(userId);
    }
    return evicted;
  },
};
