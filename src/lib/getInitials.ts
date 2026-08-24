/**
 * Iniciales para el avatar de resultados de búsqueda (spec 74, Fase 3):
 * primera letra de las dos primeras palabras. Función pura, sin dependencia
 * de un nombre completo bien formado — nombres de una sola palabra o vacíos
 * no deben romper el render.
 */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.charAt(0).toUpperCase();
  return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
}
