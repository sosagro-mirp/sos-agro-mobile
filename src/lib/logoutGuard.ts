// Spec 86 (D8, CA-20/21/22): cuánta fricción exige cada acción de cuenta.
//   switch_user   → siempre confirmación simple: conserva token, credencial y
//                   cola, así que nada se pierde aunque haya pendientes.
//   forget_device → con pendientes de cualquier tipo, advertencia fuerte con
//                   segundo paso; nunca borra SQLite, pero el dato queda
//                   esperando un ingreso en línea de ese usuario.

export type LogoutAction = "switch_user" | "forget_device";

export interface OwnerPendingCounts {
  queue: number;
  drafts: number;
  changeRequests: number;
  consents: number;
  plots: number;
}

export type PendingKind = keyof OwnerPendingCounts;

export interface LogoutGuardResult {
  level: "simple" | "strong";
  reasons: { kind: PendingKind; count: number }[];
}

const KINDS: PendingKind[] = ["queue", "drafts", "changeRequests", "consents", "plots"];

export function resolveLogoutGuard(
  action: LogoutAction,
  counts: OwnerPendingCounts,
): LogoutGuardResult {
  if (action === "switch_user") return { level: "simple", reasons: [] };

  const reasons = KINDS.filter((k) => counts[k] > 0).map((kind) => ({ kind, count: counts[kind] }));
  return { level: reasons.length > 0 ? "strong" : "simple", reasons };
}

export const PENDING_KIND_LABELS: Record<PendingKind, (n: number) => string> = {
  queue: (n) => `${n} encuesta${n === 1 ? "" : "s"} por sincronizar`,
  drafts: (n) => `${n} borrador${n === 1 ? "" : "es"} sin terminar`,
  changeRequests: (n) => `${n} solicitud${n === 1 ? "" : "es"} de cambio por enviar`,
  consents: (n) => `${n} consentimiento${n === 1 ? "" : "s"} por enviar`,
  plots: (n) => `${n} lote${n === 1 ? "" : "s"} por enviar`,
};
