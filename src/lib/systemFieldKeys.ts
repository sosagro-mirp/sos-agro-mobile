/**
 * Spec 97 (H4 del spec 83) — claves de destino de las preguntas, con sus alias.
 *
 * El backend renombra `farm.mainCrop` → `farm.crops` y `crop.<x>` →
 * `farm.hasCrop.<x>`. Las tabletas pueden tener instrumentos cacheados con
 * cualquiera de las dos, así que la extracción y el renderizado offline tratan
 * ambas igual hasta que se retiren los alias (H8).
 *
 * Es una copia mínima del registro del backend
 * (`backend/src/questions/system-fields/system-field-registry.ts`): la prueba
 * de paridad `e2e-097-systemFieldKeys.test.ts` fija su contenido.
 */

export const SYSTEM_FIELD_ALIASES: Readonly<Record<string, string>> = {
  'farm.mainCrop': 'farm.crops',
  'crop.cacao': 'farm.hasCrop.cacao',
  'crop.cafe': 'farm.hasCrop.cafe',
  'crop.cannabis': 'farm.hasCrop.cannabis',
  'crop.canamo': 'farm.hasCrop.canamo',
};

const CROP_FLAG_PREFIXES = ['farm.hasCrop.', 'crop.'] as const;

/** Clave canónica de un destino; una clave sin alias se devuelve igual y vacío da `null`. */
export function canonicalSystemField(raw?: string | null): string | null {
  const key = raw?.trim();
  if (!key) return null;
  return SYSTEM_FIELD_ALIASES[key] ?? key;
}

/** `true` para la pregunta de selección de cultivos (`farm.crops`, antes `farm.mainCrop`). */
export function isCropListField(systemField?: string | null): boolean {
  return canonicalSystemField(systemField) === 'farm.crops';
}

/**
 * Nombre ASCII del cultivo de un marcador sí/no (`farm.hasCrop.<x>`, antes
 * `crop.<x>`); `null` si la clave no es un marcador de cultivo.
 */
export function cropFlagName(systemField?: string | null): string | null {
  const key = systemField?.trim();
  if (!key) return null;
  for (const prefix of CROP_FLAG_PREFIXES) {
    if (key.startsWith(prefix) && key.length > prefix.length) {
      return key.slice(prefix.length);
    }
  }
  return null;
}
