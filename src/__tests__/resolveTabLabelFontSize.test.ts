/**
 * Tamaño único de las etiquetas del tab bar: todas iguales y sin cortarse.
 * Hallazgo en un teléfono real tras la OTA del spec 92 (etiquetas e íconos de
 * tamaños distintos).
 */
import { resolveTabLabelFontSize, TAB_LABEL_BASE_FONT_SIZE } from "../lib/resolveTabLabelFontSize";

const LABELS = ["Campañas", "Borradores", "Sincronizar", "Solicitudes", "Realizadas"];
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
    expect(widthOf("Sincronizar", size)).toBeLessThanOrEqual(tabWidth(360));
    // La escala no puede agrandarla más allá de lo que cabe.
    expect(size).toBe(resolveTabLabelFontSize({ windowWidth: 360, fontScale: 1, labels: LABELS }));
  });

  it("una etiqueta más larga obliga a letra más pequeña (por eso es «Sincronizar» y no «Sincronización»)", () => {
    const longer = LABELS.map((l) => (l === "Sincronizar" ? "Sincronización" : l));
    expect(resolveTabLabelFontSize({ windowWidth: 360, fontScale: 1, labels: LABELS })).toBeGreaterThan(
      resolveTabLabelFontSize({ windowWidth: 360, fontScale: 1, labels: longer }),
    );
  });

  it("desde 412 dp alcanza el tamaño de diseño", () => {
    expect(resolveTabLabelFontSize({ windowWidth: 412, fontScale: 1, labels: LABELS })).toBeCloseTo(TAB_LABEL_BASE_FONT_SIZE, 0);
  });

  it("valores inválidos no rompen el render", () => {
    expect(resolveTabLabelFontSize({ windowWidth: NaN, fontScale: NaN, labels: LABELS })).toBe(TAB_LABEL_BASE_FONT_SIZE);
    expect(resolveTabLabelFontSize({ windowWidth: 0, fontScale: 1, labels: [] })).toBe(TAB_LABEL_BASE_FONT_SIZE);
  });
});
