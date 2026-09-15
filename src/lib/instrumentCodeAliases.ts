/**
 * Alias legado de códigos de instrumento (hotfix backend 2026-08-22, spec 43).
 *
 * El backfill `BackfillInstrumentCodes` renombró los instrumentos de
 * identificación a `code: 'S1a'` / `code: 'S1b'` para no chocar con `'S2'`
 * (un instrumento de contenido real, "Cultivos — Identificación de
 * Cadenas"). El backend resuelve el alias legado en `findByCode` (ver
 * `InstrumentsService.LEGACY_CODE_ALIASES`), pero el `render` de un
 * instrumento devuelve su `code` real (`'S1a'`/`'S1b'`) — no el alias
 * (`'S1'`/`'S2'`) que el resto del código móvil sigue usando para
 * identificar el flujo de pre-encuesta. Sin resolver el alias también acá,
 * el instrumento cacheado offline nunca hace match contra `'S1'`/`'S2'`
 * literal, aunque sí esté descargado (spec 78, TC-078-011).
 */
export const LEGACY_INSTRUMENT_CODE_ALIASES: Record<'S1' | 'S2', string> = {
  S1: 'S1a',
  S2: 'S1b',
};

/** Normaliza el `code` real de un instrumento cacheado al alias legado (`'S1'`/`'S2'`) que usa el resto del código, si aplica. */
export function resolveLegacyInstrumentCode(code: string | null | undefined): 'S1' | 'S2' | null {
  if (code === 'S1' || code === LEGACY_INSTRUMENT_CODE_ALIASES.S1) return 'S1';
  if (code === 'S2' || code === LEGACY_INSTRUMENT_CODE_ALIASES.S2) return 'S2';
  return null;
}

/**
 * Spec 84 — código del flujo de registro de un instrumento cacheado:
 * `'REG'` para el instrumento de Registro (`S_REG`, un solo instrumento que
 * reemplaza a S1+S2), o el alias legado `'S1'`/`'S2'` mientras ese
 * instrumento no exista en el backend (respaldo, ver `registrationFlow.ts`).
 * Superconjunto de `resolveLegacyInstrumentCode`: ambas conviven porque el
 * respaldo S1/S2 sigue funcionando igual que antes del spec 84.
 */
export function resolveRegistrationFlowCode(
  code: string | null | undefined,
): 'REG' | 'S1' | 'S2' | null {
  if (code === 'S_REG') return 'REG';
  return resolveLegacyInstrumentCode(code);
}
