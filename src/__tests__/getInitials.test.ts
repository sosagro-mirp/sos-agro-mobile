import { getInitials } from '../lib/getInitials';

describe('getInitials', () => {
  it('toma la primera letra de las dos primeras palabras', () => {
    expect(getInitials('María Restrepo Vélez')).toBe('MR');
  });

  it('un nombre de una sola palabra usa solo su primera letra', () => {
    expect(getInitials('Madonna')).toBe('M');
  });

  it('recorta espacios repetidos entre palabras', () => {
    expect(getInitials('  Jairo   Peña  ')).toBe('JP');
  });

  it('nombre vacío devuelve "?"', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials('   ')).toBe('?');
  });

  it('siempre devuelve mayúsculas', () => {
    expect(getInitials('luz cardona')).toBe('LC');
  });
});
