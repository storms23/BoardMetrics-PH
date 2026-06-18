import type { XAxisProps } from "recharts";

/** X-axis props that stay readable when many exam cycles are plotted. */
export function crowdedCycleXAxis(pointCount: number): Pick<
  XAxisProps,
  "angle" | "textAnchor" | "height" | "interval" | "tick" | "tickMargin"
> & { marginBottom: number } {
  const crowded = pointCount > 6;
  const veryCrowded = pointCount > 12;

  return {
    // Always show every cycle label; rotate when dense to avoid overlap.
    angle: crowded ? -52 : 0,
    textAnchor: crowded ? "end" : "middle",
    height: crowded ? (veryCrowded ? 72 : 56) : 30,
    interval: 0,
    tickMargin: crowded ? 10 : 6,
    tick: { fill: "#475569", fontSize: 11 },
    marginBottom: crowded ? (veryCrowded ? 78 : 60) : 10,
  };
}
