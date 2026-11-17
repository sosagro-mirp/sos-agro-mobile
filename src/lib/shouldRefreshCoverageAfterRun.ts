// Spec 103 (DM4, auditoría 80 M1) — tras una corrida de sync, la foto de
// cobertura se refresca solo si la corrida atendió entradas y la cola quedó con
// menos pendientes que al empezar (algo salió de verdad). Los conteos son de la
// cola completa, de todos los dueños; `null` = no se pudo contar → no se refresca.
export function shouldRefreshCoverageAfterRun(params: {
  attended: number;
  pendingBefore: number | null;
  pendingAfter: number | null;
}): boolean {
  const { attended, pendingBefore, pendingAfter } = params;
  if (attended <= 0) return false;
  if (pendingBefore === null || pendingAfter === null) return false;
  return pendingAfter < pendingBefore;
}
