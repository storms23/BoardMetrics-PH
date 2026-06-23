import { ChartScroll, type ChartScrollContext } from "./ChartScroll";

export type { ChartScrollContext };

/** Scrollable chart shell with dynamic width from data point count. */
export function ChartFrame({
  pointCount,
  children,
  rightRail,
}: {
  pointCount: number;
  children: (chartWidth: number, context: ChartScrollContext) => React.ReactNode;
  rightRail?: (context: ChartScrollContext) => React.ReactNode;
}) {
  return (
    <ChartScroll pointCount={pointCount} rightRail={rightRail}>
      {children}
    </ChartScroll>
  );
}
