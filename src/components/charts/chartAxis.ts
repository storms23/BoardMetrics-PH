import type { XAxisProps } from "recharts";

type CrowdedAxisOptions = {
  hasCallouts?: boolean;
};

/** X-axis props for cycle charts — two-line ticks, no rotation when width scales with data. */
export function crowdedCycleXAxis(
  pointCount: number,
  options: CrowdedAxisOptions = {},
): Pick<
  XAxisProps,
  "angle" | "textAnchor" | "height" | "interval" | "tickMargin"
> & { marginBottom: number } {
  void pointCount;
  void options;

  return {
    angle: 0,
    textAnchor: "middle",
    height: 42,
    interval: 0,
    tickMargin: 8,
    marginBottom: 46,
  };
}
