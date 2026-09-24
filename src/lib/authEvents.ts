// Spec 86 (D3): canal mínimo por el que `httpClient` avisa que un request con
// token recibió 401, sin importar `useAuthStore` (evita la dependencia
// circular httpClient → store → api → httpClient). `useAuthStore` se suscribe.

export type AuthFailureKind = "expired" | "rejected";

export interface AuthFailureEvent {
  kind: AuthFailureKind;
  /** Token con el que se hizo el request rechazado. */
  token: string;
  /** Hora del servidor (cabecera `Date`) en ms, o `null` si no vino. */
  serverDateMs: number | null;
}

type Listener = (event: AuthFailureEvent) => void;

const listeners = new Set<Listener>();

export const authEvents = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  emit(event: AuthFailureEvent): void {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // Un suscriptor defectuoso no debe romper el request que lo originó.
      }
    }
  },
};
