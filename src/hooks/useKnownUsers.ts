import { useCallback, useEffect, useState } from 'react';
import { offlineCredentialStorage, type KnownUser } from '../storage/offlineCredentialStorage';
import {
  evaluateOfflineLogin,
  OFFLINE_CREDENTIAL_MAX_AGE_DAYS,
  type OfflineLoginDecision,
} from '../lib/offlineCredential';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface KnownUserView {
  user: KnownUser;
  /** Fecha límite (ms) del ingreso sin conexión; `null` si ya no está disponible. */
  availableUntil: number | null;
  /** Por qué no se puede entrar sin conexión (`null` = sí se puede). */
  blockedReason: Extract<OfflineLoginDecision, { allowed: false }>['reason'] | null;
}

/**
 * Spec 86 (D9): usuarios que ya ingresaron en esta tablet, con su estado de
 * ingreso sin conexión, para el selector "¿Quién va a encuestar?".
 */
export function useKnownUsers() {
  const [users, setUsers] = useState<KnownUserView[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const known = await offlineCredentialStorage.listKnownUsers();
      const views = await Promise.all(
        known.map(async (user): Promise<KnownUserView> => {
          const cred = await offlineCredentialStorage.getCredential(user.userId);
          if (!cred) return { user, availableUntil: null, blockedReason: 'requires_online' };
          const decision = evaluateOfflineLogin(cred, Date.now());
          const availableUntil = cred.lastOnlineLoginAt + OFFLINE_CREDENTIAL_MAX_AGE_DAYS * DAY_MS;
          if (decision.allowed) return { user, availableUntil, blockedReason: null };
          // Bloqueado por intentos: sigue "disponible hasta" cuando pase el bloqueo.
          return {
            user,
            availableUntil: decision.reason === 'locked' ? availableUntil : null,
            blockedReason: decision.reason,
          };
        }),
      );
      views.sort((a, b) => b.user.lastOnlineLoginAt - a.user.lastOnlineLoginAt);
      setUsers(views);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { users, loading, reload };
}

export function formatAvailableUntil(ms: number): string {
  return new Date(ms).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
}
