/**
 * Spec 68 — regla de comparación de nombres para decidir si dos capturas de
 * `farmer.name` con el mismo `documentId` corresponden a la misma persona.
 *
 * Espejo exacto de `backend/src/farmers/name-matching.ts` — no hay paquete
 * compartido entre los repositorios, así que esta lógica se escribe dos
 * veces a propósito. Cualquier cambio acá debe replicarse ahí y viceversa —
 * ver la § "Riesgo de divergencia backend/móvil" del spec 68 y su
 * precedente doloroso (`CROP_FIELD_MAP`, spec 49, Bug A).
 *
 * Fuente de verdad de los casos cubiertos: § "Batería de casos de nombres"
 * de `spec/68_colision_documentid_entre_agricultores.md`.
 */

// Umbral acordado con el usuario en la Fase 0 del spec (2026-08-16). Separa
// "Santigo"/"Santiago" (errata de tipeo, ~95.5% de similitud, no avisa) de
// "Juan"/"Juana" (nombres distintos, ~90.9% de similitud, sí avisa) — un
// umbral del 90% no discrimina ambos casos, ver § Decisión de diseño.
const SIMILARITY_THRESHOLD = 0.93;

function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quitar diacríticos (tildes)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // puntuación → espacio
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenize(name: string): string[] {
  return normalize(name).split(' ').filter(Boolean);
}

// Un token de una sola letra cuenta como abreviatura y hace match con
// cualquier token que empiece con esa letra (cubre "Ana M. Lopez" vs
// "Ana Maria Lopez", caso 12 de la batería).
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1 && b.startsWith(a)) return true;
  if (b.length === 1 && a.startsWith(b)) return true;
  return false;
}

// El conjunto de tokens más corto es "equivalente por subconjunto" del más
// largo si cada uno de sus tokens tiene una pareja distinta en el otro
// conjunto (match exacto o por abreviatura). Cubre tanto un apellido omitido
// (menos tokens de un lado) como una abreviatura (mismo número de tokens).
function tokensSubsetEquivalent(a: string[], b: string[]): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const used = new Array<boolean>(longer.length).fill(false);

  for (const token of shorter) {
    const idx = longer.findIndex((t, i) => !used[i] && tokensMatch(token, t));
    if (idx === -1) return false;
    used[idx] = true;
  }
  return true;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * `true` cuando ambos nombres corresponden razonablemente a la misma
 * persona (no hace falta avisar); `false` cuando la colisión de
 * `documentId` debe tratarse como sospechosa (avisar).
 *
 * Regla aplicada en orden, la primera que coincide decide:
 * 1. Normalizados idénticos.
 * 2. Uno es subconjunto de tokens del otro (con abreviaturas de una letra).
 * 3. Comparten el primer nombre exacto y al menos un apellido.
 * 4. Similitud de edición (Levenshtein) del string normalizado completo ≥ 93%.
 * 5. Cualquier otro caso: personas distintas.
 */
export function isSameFarmerName(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false; // sin nombre con qué comparar → conservador (caso 13)

  const normalizedA = normalize(a);
  const normalizedB = normalize(b);
  if (!normalizedA || !normalizedB) return false;

  if (normalizedA === normalizedB) return true;

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensSubsetEquivalent(tokensA, tokensB)) return true;

  if (tokensA.length > 1 && tokensB.length > 1 && tokensA[0] === tokensB[0]) {
    const surnamesA = new Set(tokensA.slice(1));
    if (tokensB.slice(1).some((t) => surnamesA.has(t))) return true;
  }

  const maxLen = Math.max(normalizedA.length, normalizedB.length);
  const similarity =
    maxLen > 0 ? 1 - levenshtein(normalizedA, normalizedB) / maxLen : 1;

  return similarity >= SIMILARITY_THRESHOLD;
}
