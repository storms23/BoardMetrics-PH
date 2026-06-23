export type CalloutAlign = "start" | "middle" | "end";
export type CalloutPosition = "top";
export type EdgeZone = "left" | "right" | "middle";

export type CalloutPlacement = {
  align: CalloutAlign;
  dx: number;
  dy: number;
  position: CalloutPosition;
  edgeZone: EdgeZone;
  /** Extra vertical lift to avoid overlapping another callout. */
  stackDy: number;
};

export type CalloutSlot = {
  index: number;
  position: CalloutPosition;
};

export type CalloutMarginInput = {
  index: number;
  position: CalloutPosition;
};

/** Estimated pill height for 3-line callout + padding. */
export const CALLOUT_PILL_EST_HEIGHT = 54;
export const CALLOUT_PILL_EST_WIDTH = 92;

/** Shared edge placement policy for all annotated line charts. */
export const EDGE_POLICY = {
  left: {
    align: "start" as CalloutAlign,
    dxIndex0: 6,
    dxDefault: 28,
  },
  right: {
    align: "end" as CalloutAlign,
    dxIndexLast: -6,
    dxDefault: -28,
  },
  middle: {
    align: "middle" as CalloutAlign,
    dx: 0,
  },
  kneeRatio: 0.62,
  stackStep: 20,
  leaderGap: 6,
} as const;

const PILL_W = CALLOUT_PILL_EST_WIDTH;
const PILL_H = CALLOUT_PILL_EST_HEIGHT;

export function maxHorizontalOffset(edgeZone: EdgeZone, dx: number): number {
  if (edgeZone === "middle") return 0;
  return Math.abs(dx) + 4;
}

export function indexOfChartLabel(
  data: { label: string }[],
  chartLabel: string,
): number {
  const idx = data.findIndex((d) => d.label === chartLabel);
  return idx >= 0 ? idx : 0;
}

export function getEdgeZone(index: number, total: number): EdgeZone {
  if (index <= 1) return "left";
  if (index >= total - 2) return "right";
  return "middle";
}

export function isEdgeIndex(index: number, total: number): boolean {
  return getEdgeZone(index, total) !== "middle";
}

export function resolveEdgeAwarePlacement(index: number, total: number): CalloutPlacement {
  const edgeZone = getEdgeZone(index, total);

  if (edgeZone === "left") {
    const dx = index === 0 ? EDGE_POLICY.left.dxIndex0 : EDGE_POLICY.left.dxDefault;
    return {
      align: EDGE_POLICY.left.align,
      dx,
      dy: 0,
      position: "top",
      edgeZone,
      stackDy: 0,
    };
  }

  if (edgeZone === "right") {
    const dx =
      index === total - 1 ? EDGE_POLICY.right.dxIndexLast : EDGE_POLICY.right.dxDefault;
    return {
      align: EDGE_POLICY.right.align,
      dx,
      dy: 0,
      position: "top",
      edgeZone,
      stackDy: 0,
    };
  }

  return {
    align: EDGE_POLICY.middle.align,
    dx: EDGE_POLICY.middle.dx,
    dy: 0,
    position: "top",
    edgeZone,
    stackDy: 0,
  };
}

type LabelRect = { left: number; right: number; top: number; bottom: number };

function pillRect(
  dotX: number,
  align: CalloutAlign,
  dx: number,
  edgeZone: EdgeZone,
  stackDy: number,
  dotY: number,
): LabelRect {
  let anchorX = dotX;
  if (edgeZone !== "middle") anchorX = dotX + dx;
  else align = "middle";

  let left: number;
  if (align === "start") left = anchorX - 8;
  else if (align === "end") left = anchorX - PILL_W + 8;
  else left = anchorX - PILL_W / 2;

  const gap = 22 + EDGE_POLICY.leaderGap;
  const bottom = dotY - 14;
  const top = bottom - PILL_H - gap - stackDy;
  return { left, right: left + PILL_W, top, bottom };
}

function rectsOverlap(a: LabelRect, b: LabelRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export type PixelCalloutInput = {
  key: string;
  index: number;
  dotX: number;
  dotY: number;
};

/** Resolve placements using real pixel coordinates — vertical stack only. */
export function resolveCalloutPlacementsPixel(
  items: PixelCalloutInput[],
  total: number,
): Map<string, CalloutPlacement> {
  const sorted = [...items].sort((a, b) => a.index - b.index);
  const placements = new Map<string, CalloutPlacement>();

  for (const item of sorted) {
    placements.set(item.key, resolveEdgeAwarePlacement(item.index, total));
  }

  const rects: { key: string; rect: LabelRect; isEdge: boolean }[] = [];

  const collisionOrder = [...sorted].sort((a, b) => {
    const aEdge = isEdgeIndex(a.index, total) ? 0 : 1;
    const bEdge = isEdgeIndex(b.index, total) ? 0 : 1;
    return aEdge - bEdge || a.index - b.index;
  });

  for (const item of collisionOrder) {
    const p = placements.get(item.key)!;
    const itemIsEdge = isEdgeIndex(item.index, total);
    let stackDy = 0;

    for (let attempt = 0; attempt < 12; attempt++) {
      const rect = pillRect(
        item.dotX,
        p.align,
        p.dx,
        p.edgeZone,
        stackDy,
        item.dotY,
      );
      const hit = rects.find((r) => rectsOverlap(r.rect, rect));

      if (!hit) {
        placements.set(item.key, { ...p, stackDy });
        rects.push({ key: item.key, rect, isEdge: itemIsEdge });
        break;
      }

      if (itemIsEdge && hit.isEdge) {
        stackDy += EDGE_POLICY.stackStep;
      } else if (itemIsEdge) {
        placements.set(item.key, { ...p, stackDy });
        rects.push({ key: item.key, rect, isEdge: true });
        const bumped = placements.get(hit.key);
        if (bumped) {
          placements.set(hit.key, {
            ...bumped,
            stackDy: bumped.stackDy + EDGE_POLICY.stackStep,
          });
        }
        break;
      } else {
        stackDy += EDGE_POLICY.stackStep;
      }

      if (attempt === 11) {
        placements.set(item.key, { ...p, stackDy });
        rects.push({ key: item.key, rect, isEdge: itemIsEdge });
      }
    }
  }

  return placements;
}

/** Pre-chart margin estimate (before scales are known). */
export function resolveCalloutPlacementsBatch(
  items: { key: string; index: number; dotY?: number }[],
  total: number,
  chartWidth = 700,
): Map<string, CalloutPlacement> {
  void chartWidth;
  const marginLeft = 44;
  const marginTop = 84;
  const plotHeight = 200;
  const pixelItems: PixelCalloutInput[] = items.map((item) => {
    const inner = chartWidth - marginLeft - 16;
    const dotX =
      total <= 1
        ? chartWidth / 2
        : marginLeft + (item.index / (total - 1)) * inner;
    const dotY =
      item.dotY ??
      marginTop + plotHeight * (item.index % 2 === 0 ? 0.35 : 0.55);
    return { key: item.key, index: item.index, dotX, dotY };
  });
  return resolveCalloutPlacementsPixel(pixelItems, total);
}

export function resolveCalloutPlacement({
  index,
  total,
  positionHint = "top",
  occupiedSlots = [],
}: {
  index: number;
  total: number;
  positionHint?: CalloutPosition;
  occupiedSlots?: CalloutSlot[];
}): CalloutPlacement {
  const batch = resolveCalloutPlacementsBatch([{ key: "single", index }], total);
  const base = batch.get("single") ?? resolveEdgeAwarePlacement(index, total);
  void positionHint;
  void occupiedSlots;
  return base;
}

/** Chart margins — room for text callouts above plot. */
export function computeCalloutMargins({
  pointCount,
  calloutCount,
  highlightIndices = [],
  baseBottom = 10,
  maxStackDy = 0,
}: {
  pointCount: number;
  calloutCount: number;
  highlightIndices?: number[];
  callouts?: CalloutMarginInput[];
  baseBottom?: number;
  maxStackDy?: number;
  valleyDotRatio?: number;
}): { top: number; right: number; bottom: number; left: number } {
  const leftEdge = highlightIndices.some((i) => i <= 1);
  const rightEdge = highlightIndices.some((i) => i >= pointCount - 2);

  let top = 20;
  if (calloutCount >= 2) top = 56;
  else if (calloutCount === 1) top = 44;

  top += Math.max(0, maxStackDy);

  return {
    top,
    right: rightEdge ? 28 : 12,
    bottom: baseBottom,
    left: leftEdge ? 28 : 4,
  };
}
