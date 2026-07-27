import React from "react";
import { Text, TextProps } from "react-native";

/**
 * Font-scale ceiling for layout-constrained text (headers, pills, short
 * buttons). Starting point from spec 24's design decision, not yet confirmed
 * against a physical device — TC-024-01 (docs/testing/22-test-spec24.md)
 * measures the real threshold and may adjust this value.
 */
export const MAX_FONT_SCALE = 1.3;

/**
 * Resolves the props to apply to the underlying `Text`: forwards everything
 * as-is and adds `maxFontSizeMultiplier: MAX_FONT_SCALE` only when the
 * call-site didn't already specify one (0 counts as "unbounded" and is kept).
 * Pulled out as a pure function because the project has no
 * `@testing-library/react-native` / `react-test-renderer` to test a render.
 */
export function resolveAppTextProps(props: TextProps): TextProps {
  return {
    ...props,
    maxFontSizeMultiplier: props.maxFontSizeMultiplier ?? MAX_FONT_SCALE,
  };
}

export const AppText: React.FC<TextProps> = (props) => {
  return <Text {...resolveAppTextProps(props)} />;
};
