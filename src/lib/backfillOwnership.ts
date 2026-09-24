// Spec 86 (D6, CA-19): los registros creados antes de la migración m0013 no
// tienen dueño. Una sola vez, se asignan al usuario que tenía la sesión
// cacheada en ese momento (con altísima probabilidad, quien los creó). Si no
// hay ninguno, se dejan en `null` y se procesan con el token de la sesión
// activa, como antes.

export interface BackfillOwnershipDeps {
  isDone: () => Promise<boolean>;
  markDone: () => Promise<void>;
  getLegacyCachedUserId: () => Promise<string | null>;
  assignNullOwners: (userId: string) => Promise<void>;
}

export async function backfillOwnership(deps: BackfillOwnershipDeps): Promise<void> {
  if (await deps.isDone()) return;

  const userId = await deps.getLegacyCachedUserId();
  // Si la asignación falla, la marca no se escribe y se reintenta al próximo arranque.
  if (userId) await deps.assignNullOwners(userId);

  await deps.markDone();
}
