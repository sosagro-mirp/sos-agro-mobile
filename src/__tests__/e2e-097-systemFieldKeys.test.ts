/**
 * Spec 97 — Diccionario de datos (H4 del spec 83): compatibilidad del móvil
 * con las claves canónicas y sus alias (criterio C15, va por OTA).
 *
 * El backend renombra `farm.mainCrop` → `farm.crops` y `crop.<x>` →
 * `farm.hasCrop.<x>`. Las tabletas pueden tener instrumentos cacheados con
 * cualquiera de las dos, así que la extracción y el renderizado offline deben
 * tratarlas igual hasta H8.
 *
 * ARRANCA EN ROJO, a propósito: `src/lib/systemFieldKeys.ts` no existe y la
 * extracción offline compara literales (`'farm.mainCrop'`, `startsWith('crop.')`).
 * Los módulos nuevos se cargan con `loadExport()` dentro de cada caso para que
 * un import roto no tumbe el archivo entero.
 *
 * Contrato de `src/lib/systemFieldKeys.ts` (nombres propuestos):
 *   - `SYSTEM_FIELD_ALIASES`: alias → clave canónica (copia mínima del registro
 *     del backend; la prueba de paridad fija su contenido).
 *   - `canonicalSystemField(raw)`: clave canónica; una clave sin alias se
 *     devuelve igual; `null`/vacío → `null`.
 *   - `isCropListField(sf)`: `true` para `farm.crops` y `farm.mainCrop`.
 *   - `cropFlagName(sf)`: `'cacao' | 'cafe' | 'cannabis' | 'canamo'` para
 *     `farm.hasCrop.<x>` y `crop.<x>`; `null` para lo demás.
 *
 * Lo que no cabe en unitario (extracción offline completa con SQLite, render
 * en tableta, entrega por OTA) se valida en `docs/testing/test-097-diccionario-datos.md`.
 */

import * as fs from 'fs';
import * as path from 'path';

function loadExport<T>(modulePath: string, name: string): T {
  let mod: Record<string, unknown>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require(modulePath) as Record<string, unknown>;
  } catch {
    throw new Error(`Spec 97 sin implementar: no existe el módulo \`${modulePath}\`.`);
  }
  if (mod[name] === undefined) {
    throw new Error(`Spec 97 sin implementar: falta \`${name}\` en \`${modulePath}\`.`);
  }
  return mod[name] as T;
}

const KEYS = '../lib/systemFieldKeys';

describe('C15 — systemFieldKeys: claves canónicas y alias', () => {
  it('paridad: los alias son exactamente los del registro del backend', () => {
    const aliases = loadExport<Record<string, string>>(KEYS, 'SYSTEM_FIELD_ALIASES');
    expect(aliases).toEqual({
      'farm.mainCrop': 'farm.crops',
      'crop.cacao': 'farm.hasCrop.cacao',
      'crop.cafe': 'farm.hasCrop.cafe',
      'crop.cannabis': 'farm.hasCrop.cannabis',
      'crop.canamo': 'farm.hasCrop.canamo',
    });
  });

  it('canonicalSystemField resuelve alias y deja pasar las demás claves', () => {
    const canonical = loadExport<(raw?: string | null) => string | null>(
      KEYS,
      'canonicalSystemField',
    );
    expect(canonical('farm.mainCrop')).toBe('farm.crops');
    expect(canonical('crop.canamo')).toBe('farm.hasCrop.canamo');
    expect(canonical('farm.crops')).toBe('farm.crops');
    expect(canonical('farmer.name')).toBe('farmer.name');
    expect(canonical(null)).toBeNull();
    expect(canonical('')).toBeNull();
  });

  it('isCropListField acepta la clave nueva y la vieja', () => {
    const isCropList = loadExport<(sf?: string | null) => boolean>(KEYS, 'isCropListField');
    expect(isCropList('farm.crops')).toBe(true);
    expect(isCropList('farm.mainCrop')).toBe(true);
    expect(isCropList('farm.name')).toBe(false);
    expect(isCropList(undefined)).toBe(false);
  });

  it('cropFlagName da el mismo cultivo con farm.hasCrop.x y con crop.x', () => {
    const flag = loadExport<(sf?: string | null) => string | null>(KEYS, 'cropFlagName');
    for (const crop of ['cacao', 'cafe', 'cannabis', 'canamo']) {
      expect(flag(`farm.hasCrop.${crop}`)).toBe(crop);
      expect(flag(`crop.${crop}`)).toBe(crop);
    }
    expect(flag('farm.crops')).toBeNull();
    expect(flag('farmer.name')).toBeNull();
  });
});

describe('C15 — la extracción offline usa systemFieldKeys, no literales', () => {
  const read = (file: string) =>
    fs.readFileSync(path.join(__dirname, '..', 'lib', file), 'utf8');

  it('extractCropsOffline importa systemFieldKeys y no compara literales de cultivo', () => {
    const src = read('extractCropsOffline.ts');
    expect(src).toMatch(/from ['"]\.\/systemFieldKeys['"]/);
    expect(src).not.toMatch(/===\s*['"]farm\.mainCrop['"]/);
    expect(src).not.toMatch(/startsWith\(\s*['"]crop\.['"]\s*\)/);
  });

  it('extractFarmerLocally normaliza con canonicalSystemField antes del switch', () => {
    const src = read('extractFarmerLocally.ts');
    expect(src).toMatch(/from ['"]\.\/systemFieldKeys['"]/);
    expect(src).toMatch(/canonicalSystemField\(/);
  });
});
