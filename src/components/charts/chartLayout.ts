/** Minimum horizontal space per data point on scrollable (mobile) charts. */
export const CHART_MIN_POINT_WIDTH = 48;

/** Floor width on mobile so short series still have room to pan. */
export const CHART_MIN_WIDTH = 600;

export type ChartWidthMode = "fit" | "scroll";

export function computeChartWidth(
  pointCount: number,
  containerWidth: number,
  mode: ChartWidthMode = "scroll",
): number {
  if (mode === "fit") {
    return Math.max(1, containerWidth);
  }
  const byPoints = Math.max(1, pointCount) * CHART_MIN_POINT_WIDTH;
  return Math.max(containerWidth, byPoints, CHART_MIN_WIDTH);
}
