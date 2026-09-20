// Spec 87 (Fase 5, CA-15): reconoce, entre los envíos en `failed_validation`, los
// que fallaron porque una pregunta número + unidad viajó a medias. El backend
// responde 400 con este texto (`responses.service.ts`), y ese 400 tumba el lote
// completo, así que la encuesta entera queda atascada.

const NUMERIC_UNIT_ERROR = /numeric_with_unit.*(require|both)/i;

export function isNumericUnitValidationError(errorDetail?: string | null): boolean {
  return Boolean(errorDetail && NUMERIC_UNIT_ERROR.test(errorDetail));
}

/** Texto para el encuestador, o `null` si el error no es de esta causa. */
export function describeNumericUnitRecovery(errorDetail?: string | null): string | null {
  if (!isNumericUnitValidationError(errorDetail)) return null;
  return (
    "Una respuesta de valor con unidad quedó sin unidad y el servidor rechazó la encuesta. " +
    "Toca Reintentar: se enviará completa, sin esa respuesta."
  );
}
