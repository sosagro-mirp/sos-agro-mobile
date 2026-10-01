/**
 * Tamaño único de las etiquetas del tab bar: todas iguales y sin cortarse.
 * Hallazgo en un teléfono real tras la OTA del spec 92 (etiquetas e íconos de
 * tamaños distintos).
 */
import { resolveTabLabelFontSize, TAB_LABEL_BASE_FONT_SIZE } from "../lib/resolveTabLabelFontSize";

const LABELS = ["Campañas", "Borradores", "Sincronización", "Solicitudes", "Realizadas"];
const TAB_BAR_PADDING = 20;
const ADVANCE = 0.6; // JetBrains Mono

/** Ancho que ocupa una etiqueta con ese tamaño. */
const widthOf = (label: string, fontSize: number) => Array.from(label).length * ADVANCE * fontSize;
const tabWidth = (windowWidth: number) => (windowWidth - 2 * TAB_BAR_PADDING) / LABELS.length;

describe("resolveTabLabelFontSize", () => {
  it.each([320, 360, 393, 412, 427])("en %i dp la etiqueta más larga cabe en su pestaña", (windowWidth) => {
    const size = resolveTabLabelFontSize({ windowWidth, fontScale: 1, labels: LABELS });
    for (const label of LABELS) {
      expect(widthOf(label, size)).toBeLessThanOrEqual(tabWidth(windowWidth));
    }
  });

  it("no depende de cada etiqueta: devuelve un solo número para todas", () => {
    const size = resolveTabLabelFontSize({ windowWidth: 360, fontScale: 1, labels: LABELS });
    expect(typeof size).toBe("number");
    expect(size).toBeGreaterThan(0);
  });

  it("con espacio de sobra usa el tamaño de diseño", () => {
    expect(resolveTabLabelFontSize({ windowWidth: 800, fontScale: 1, labels: LABELS })).toBe(TAB_LABEL_BASE_FONT_SIZE);
  });

  it("respeta la escala del sistema, con tope en 1.3, cuando cabe", () => {
    expect(resolveTabLabelFontSize({ windowWidth: 1200, fontScale: 1.3, labels: LABELS })).toBeCloseTo(14.3, 1);
    expect(resolveTabLabelFontSize({ windowWidth: 1200, fontScale: 2, labels: LABELS })).toBeCloseTo(14.3, 1);
  });

  it("con letra grande en pantalla angosta sigue cabiendo (nunca se corta)", () => {
    const size = resolveTabLabelFontSize({ windowWidth: 360, fontScale: 1.3, labels: LABELS });
    expect(widthOf("Sincronización", size)).toBeLessThanOrEqual(tabWidth(360));
    // La escala no puede agrandarla más allá de lo que cabe.
    expect(size).toBe(resolveTabLabelFontSize({ windowWidth: 360, fontScale: 1, labels: LABELS }));
  });

  it("etiquetas más cortas permiten letra más grande", () => {
    const shorter = LABELS.map((l) => (l === "Sincronización" ? "Sincronizar" : l));
    expect(resolveTabLabelFontSize({ windowWidth: 360, fontScale: 1, labels: shorter })).toBeGreaterThan(
      resolveTabLabelFontSize({ windowWidth: 360, fontScale: 1, labels: LABELS }),
    );
  });

  it("valores inválidos no rompen el render", () => {
    expect(resolveTabLabelFontSize({ windowWidth: NaN, fontScale: NaN, labels: LABELS })).toBe(TAB_LABEL_BASE_FONT_SIZE);
    expect(resolveTabLabelFontSize({ windowWidth: 0, fontScale: 1, labels: [] })).toBe(TAB_LABEL_BASE_FONT_SIZE);
  });
});
