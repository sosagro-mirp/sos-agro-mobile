import { decideAuthNavigation, MAX_NAVIGATION_RETRIES } from '../lib/authGuardNavigation';

const base = { isRestoring: false, navigationReady: true };

describe('decideAuthNavigation (AuthGuard)', () => {
  it('no navega mientras se restaura la sesión ni antes de que el navegador esté listo', () => {
    expect(decideAuthNavigation({ ...base, isRestoring: true, prevId: undefined, currId: null })).toEqual({ type: 'none' });
    expect(decideAuthNavigation({ ...base, navigationReady: false, prevId: undefined, currId: 'u1' })).toEqual({ type: 'none' });
  });

  it('en el arranque sin usuario va a login sin vaciar la pila', () => {
    expect(decideAuthNavigation({ ...base, prevId: undefined, currId: null })).toEqual({ type: 'login', clearStack: false });
  });

  it('en el arranque con usuario va a campañas', () => {
    expect(decideAuthNavigation({ ...base, prevId: undefined, currId: 'u1' })).toEqual({ type: 'campaign' });
  });

  it('al cerrarse la sesión de un usuario vacía la pila (no deja ver sus pantallas con "atrás")', () => {
    expect(decideAuthNavigation({ ...base, prevId: 'u1', currId: null })).toEqual({ type: 'login', clearStack: true });
  });

  it('al pasar a otro usuario va a campañas', () => {
    expect(decideAuthNavigation({ ...base, prevId: null, currId: 'u2' })).toEqual({ type: 'campaign' });
    expect(decideAuthNavigation({ ...base, prevId: 'u1', currId: 'u2' })).toEqual({ type: 'campaign' });
  });

  it('sin cambio de identidad no reinicia la navegación', () => {
    expect(decideAuthNavigation({ ...base, prevId: 'u1', currId: 'u1' })).toEqual({ type: 'none' });
    expect(decideAuthNavigation({ ...base, prevId: null, currId: null })).toEqual({ type: 'none' });
  });

  it('el tope de reintentos es finito', () => {
    expect(Number.isInteger(MAX_NAVIGATION_RETRIES)).toBe(true);
    expect(MAX_NAVIGATION_RETRIES).toBeGreaterThan(0);
  });
});
