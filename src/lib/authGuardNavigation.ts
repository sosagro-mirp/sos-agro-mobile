// Spec 86: decisión pura del AuthGuard (app/_layout.tsx). Vive aparte para poder
// probarla sin el navegador: en la ronda manual hicieron falta tres arreglos
// seguidos por errores de navegación en el arranque y al salir con "atrás".

export type AuthGuardAction =
  | { type: "none" }
  | { type: "login"; clearStack: boolean }
  | { type: "campaign" };

export interface AuthGuardInput {
  isRestoring: boolean;
  /** El navegador raíz ya está montado. */
  navigationReady: boolean;
  /** Último usuario al que se navegó: `undefined` = todavía ninguno (arranque). */
  prevId: string | null | undefined;
  currId: string | null;
}

/** Reintentos de navegación antes de rendirse y registrar el error. */
export const MAX_NAVIGATION_RETRIES = 20;

export function decideAuthNavigation(input: AuthGuardInput): AuthGuardAction {
  const { isRestoring, navigationReady, prevId, currId } = input;
  if (isRestoring || !navigationReady) return { type: "none" };
  // Sin cambio de identidad no se reinicia la navegación a mitad de sesión.
  if (prevId === currId) return { type: "none" };
  if (currId === null) {
    // En el arranque no hay pila que vaciar; después, sí: `replace` solo cambia la
    // pantalla de arriba y "atrás" dejaría ver las del usuario anterior sin sesión.
    return { type: "login", clearStack: prevId !== undefined };
  }
  return { type: "campaign" };
}
