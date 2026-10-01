// Spec 86 (D6): decide qué dueños de la cola se procesan en esta corrida y con
// qué token. Cada envío sale con el token de quien lo creó, no con el de quien
// esté usando la tablet en ese momento.

export interface OwnerSyncInput {
  /** Dueños con ítems pendientes. `null` = registro anterior a la migración. */
  owners: (string | null)[];
  /** Token guardado por usuario (`null` = no hay). */
  tokens: Record<string, string | null | undefined>;
  /** Usuarios cuya sesión con el servidor quedó por renovar. */
  reauthRequired: Set<string>;
  activeUserId: string | null;
}

export interface OwnerSyncPlan {
  toProcess: { ownerUserId: string | null; token: string }[];
  /** Dueños con pendientes que esperan un ingreso con conexión suyo. */
  waiting: string[];
}

export function planOwnerSync(input: OwnerSyncInput): OwnerSyncPlan {
  const { owners, tokens, reauthRequired, activeUserId } = input;
  const toProcess: OwnerSyncPlan["toProcess"] = [];
  const waiting: string[] = [];
  const seen = new Set<string | null>();

  for (const owner of owners) {
    if (seen.has(owner)) continue;
    seen.add(owner);

    if (owner === null) {
      // Sin dueño conocido: se procesa con la sesión activa, como antes.
      const token = activeUserId ? tokens[activeUserId] : null;
      if (token && !reauthRequired.has(activeUserId as string)) {
        toProcess.push({ ownerUserId: null, token });
      }
      continue;
    }

    const token = tokens[owner];
    if (!token || reauthRequired.has(owner)) {
      waiting.push(owner);
      continue;
    }
    toProcess.push({ ownerUserId: owner, token });
  }

  return { toProcess, waiting };
}
