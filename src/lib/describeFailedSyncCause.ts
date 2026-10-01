// Spec 87 (Fase 5, CA-15): reconoce, entre los envíos en `failed_validation`, los
// que fallaron porque una pregunta número + unidad viajó a medias. El backend
// responde 400 con este texto (`responses.service.ts`), y ese 400 tumba el lote
// completo, así que la encuesta entera queda atascada.

const NUMERIC_UNIT_ERROR = /numeric_with_unit.*(require|both)/i;

export function isNumericUnitValidationError(errorDetail?: string | null): boolean {
  return Boolean(errorDetail && NUMERIC_UNIT_ERROR.test(errorDetail));
}

/**
 * Spec 90 — explicación en español del envío fallido, sea cual sea la causa
 * conocida, o `null` si no reconocemos el error (y entonces se muestra el texto
 * crudo del backend). Cada causa nueva se suma aquí, en vez de encadenar
 * condicionales en la pantalla.
 */
export function describeSyncFailure(errorDetail?: string | null): string | null {
  return (
    describeNumericUnitRecovery(errorDetail) ?? describeProvisionalFarmerRecovery(errorDetail)
  );
}

// Spec 90 — el otro 400 que condena una encuesta: el borrador conservaba un
// `farmerId` provisional y el backend solo acepta UUID. Desde este spec ya no
// debería ocurrir, pero las entradas atascadas de antes siguen mostrando el
// texto crudo, y el encuestador no tiene por qué leer «farmerId must be a UUID».
const PROVISIONAL_FARMER_ERROR = /farmerId must be a UUID/i;

export function isProvisionalFarmerError(errorDetail?: string | null): boolean {
  return Boolean(errorDetail && PROVISIONAL_FARMER_ERROR.test(errorDetail));
}

/** Texto para el encuestador, o `null` si el error no es de esta causa. */
export function describeProvisionalFarmerRecovery(errorDetail?: string | null): string | null {
  if (!isProvisionalFarmerError(errorDetail)) return null;
  return (
    "La encuesta se guardó antes de que el productor quedara registrado en el servidor. " +
    "Toca Reintentar: se enviará vinculada al productor, o sin el vínculo si aún no se puede resolver. " +
    "Ninguna respuesta se pierde."
  );
}

/** Texto para el encuestador, o `null` si el error no es de esta causa. */
export function describeNumericUnitRecovery(errorDetail?: string | null): string | null {
  if (!isNumericUnitValidationError(errorDetail)) return null;
  return (
    "Una respuesta de valor con unidad quedó sin unidad y el servidor rechazó la encuesta. " +
    "Toca Reintentar: se enviará sin esa respuesta y el valor quedará anotado en esta pantalla."
  );
}
