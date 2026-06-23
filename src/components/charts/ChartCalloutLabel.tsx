"use client";

import type { EdgeZone } from "./callout-placement";
import { HIGHLIGHT_DOT_R } from "./highlight-colors";
import { parseCycleLabel } from "./chartData";

export type CalloutRole = "Lowest" | "Highest" | "Peak";

type ChartCalloutLabelProps = {
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
  cx?: number;
  cy?: number;
  x?: number;
  y?: number;
  role: CalloutRole;
  fullLabel: string;
  valueFormatted: string;
  color?: string;
  stackDy?: number;
  edgeZone?: EdgeZone;
};

const LINE_HEIGHT = 11;
const GAP_ABOVE_DOT = 10;

function textAnchorForEdge(edgeZone: EdgeZone): "start" | "middle" | "end" {
  if (edgeZone === "left") return "start";
  if (edgeZone === "right") return "end";
  return "middle";
}

function labelXForEdge(cx: number, edgeZone: EdgeZone): number {
  if (edgeZone === "left") return cx + 4;
  if (edgeZone === "right") return cx - 4;
  return cx;
}

/** Recharts 3 label callbacks get a dot-sized viewBox, not cx/cy. */
function resolveDotCenter(props: ChartCalloutLabelProps): { cx: number; cy: number } | null {
  if (props.cx != null && props.cy != null) {
    return { cx: props.cx, cy: props.cy };
  }

  const { viewBox } = props;
  if (
    viewBox?.x != null &&
    viewBox?.y != null &&
    viewBox?.width != null &&
    viewBox?.height != null
  ) {
    return {
      cx: viewBox.x + viewBox.width / 2,
      cy: viewBox.y + viewBox.height / 2,
    };
  }

  if (props.x != null && props.y != null) {
    return { cx: props.x, cy: props.y };
  }

  return null;
}

/**
 * Simple text-only callout above a highlight dot — no box, no leader lines.
 */
export function ChartCalloutLabel(props: ChartCalloutLabelProps) {
  const {
    role,
    fullLabel,
    valueFormatted,
    color = "#0f172a",
    stackDy = 0,
    edgeZone = "middle",
  } = props;

  const center = resolveDotCenter(props);
  if (!center) return null;

  const { cx, cy } = center;
  const { cycleLine } = parseCycleLabel(fullLabel);
  const lines = [role, cycleLine, valueFormatted];
  const anchor = textAnchorForEdge(edgeZone);
  const x = labelXForEdge(cx, edgeZone);
  const bottomY = cy - HIGHLIGHT_DOT_R - GAP_ABOVE_DOT - stackDy;

  return (
    <g pointerEvents="none" className="chart-callout-label">
      {lines.map((line, i) => {
        const y = bottomY - (lines.length - 1 - i) * LINE_HEIGHT;
        const isRole = i === 0;
        const isValue = i === 2;
        return (
          <text
            key={`${line}-${i}`}
            x={x}
            y={y}
            textAnchor={anchor}
            fill={isRole ? color : isValue ? "#1e293b" : "#475569"}
            fontSize={isRole ? 10 : 9}
            fontWeight={isRole || isValue ? 700 : 600}
          >
            {line}
          </text>
        );
      })}
    </g>
  );
}

/** Dedupe highlights that share the same chart x-axis key. */
export function uniqueHighlights<T extends { chartLabel: string }>(
  items: (T | null | undefined)[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item || seen.has(item.chartLabel)) continue;
    seen.add(item.chartLabel);
    out.push(item);
  }
  return out;
}
