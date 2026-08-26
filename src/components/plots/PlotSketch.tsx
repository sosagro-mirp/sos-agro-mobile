import React, { useMemo } from "react";
import { View } from "react-native";
import Svg, { Rect, Polygon, Circle, Text as SvgText, Defs, Pattern, Path } from "react-native-svg";
import { useTheme } from "../../theme/ThemeProvider";
import { projectPolygon, type LatLngPoint } from "../../lib/polygonGeometry";

export type PlotSketchSize = "thumbnail" | "capture" | "sheet" | "panel";

const DIMENSIONS: Record<PlotSketchSize, { width: number; height: number; margin: number; showGrid: boolean; showLabels: boolean }> = {
  thumbnail: { width: 56, height: 56, margin: 6, showGrid: false, showLabels: false },
  capture: { width: 200, height: 150, margin: 14, showGrid: true, showLabels: true },
  sheet: { width: 200, height: 150, margin: 14, showGrid: true, showLabels: true },
  // Spec 74, Fase 10 — croquis "grande" del panel izquierdo de Lotes en
  // tablet. No estaba en las "tres tamaños" originales de la Fase 8; se
  // agrega acá porque el layout de dos paneles lo requiere.
  panel: { width: 380, height: 280, margin: 20, showGrid: true, showLabels: true },
};

interface PlotSketchProps {
  points: LatLngPoint[];
  size?: PlotSketchSize;
}

/**
 * Croquis vectorial del polígono — spec 74, Fase 8. SVG autoescalado sobre
 * `projectPolygon()` (geometría local, sin mapas ni tiles externos —
 * decisión de diseño 7 del spec). Tres tamaños: miniatura de 56 px para la
 * lista de lotes, panel de captura y bottom sheet de guardado (mismas
 * dimensiones que el panel).
 */
export function PlotSketch({ points, size = "capture" }: PlotSketchProps) {
  const { colors } = useTheme();
  const dims = DIMENSIONS[size];
  const projected = useMemo(
    () => projectPolygon(points, { width: dims.width, height: dims.height, margin: dims.margin }),
    [points, dims.width, dims.height, dims.margin],
  );

  const polygonPoints = projected.map((p) => `${p.x},${p.y}`).join(" ");
  const gridId = `plot-sketch-grid-${size}`;

  return (
    <View>
      <Svg width={dims.width} height={dims.height} viewBox={`0 0 ${dims.width} ${dims.height}`}>
        {dims.showGrid ? (
          <Defs>
            <Pattern id={gridId} width={20} height={20} patternUnits="userSpaceOnUse">
              <Path d="M20 0 L0 0 0 20" fill="none" stroke={colors.border} strokeWidth={1} />
            </Pattern>
          </Defs>
        ) : null}
        {dims.showGrid ? (
          <Rect x={0} y={0} width={dims.width} height={dims.height} fill={`url(#${gridId})`} />
        ) : null}
        {projected.length >= 2 ? (
          <Polygon
            points={polygonPoints}
            fill={colors.brandSubtleBg}
            stroke={colors.brand}
            strokeWidth={size === "thumbnail" ? 3 : 2.5}
            strokeLinejoin="round"
          />
        ) : null}
        {size !== "thumbnail" &&
          projected.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={5} fill={colors.brand} stroke={colors.surface} strokeWidth={2} />
          ))}
        {dims.showLabels &&
          projected.map((p, i) => (
            <SvgText
              key={`label-${i}`}
              x={p.x}
              y={p.y - 9}
              fontSize={9}
              fontWeight="800"
              fill={colors.textPrimary}
              textAnchor="middle"
            >
              {i + 1}
            </SvgText>
          ))}
      </Svg>
    </View>
  );
}
