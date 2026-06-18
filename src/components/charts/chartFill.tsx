/** Shared blue gradient fill for pass-rate / volume area charts. */
export function blueAreaGradientDef(id: string) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="8%" stopColor="#2563eb" stopOpacity={0.38} />
      <stop offset="92%" stopColor="#2563eb" stopOpacity={0.06} />
    </linearGradient>
  );
}

export const AREA_STROKE = "#2563eb";
export const AREA_DOT = {
  r: 3,
  fill: "#ffffff",
  stroke: AREA_STROKE,
  strokeWidth: 2,
} as const;
