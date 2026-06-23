"use client";

import { useEffect, useRef, useState } from "react";
import { computeChartWidth } from "./chartLayout";
import { VOLUME_AXIS_WIDTH } from "./VolumeYAxisRail";

const MOBILE_HINT = "Swipe sideways to explore the chart";
/** Tailwind `md` — fit chart on laptop/desktop, scroll on smaller screens. */
const DESKTOP_MIN_WIDTH = 768;

const CHART_MIN_WIDTH_FALLBACK = 700;

export type ChartScrollContext = {
  isScrollable: boolean;
  /** True when the volume Y-axis is rendered in a fixed right rail (mobile scroll). */
  pinnedRightAxis: boolean;
};

export function ChartScroll({
  pointCount,
  children,
  rightRail,
}: {
  pointCount: number;
  children: (chartWidth: number, context: ChartScrollContext) => React.ReactNode;
  rightRail?: (context: ChartScrollContext) => React.ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [wrapperWidth, setWrapperWidth] = useState(CHART_MIN_WIDTH_FALLBACK);
  const [fitToContainer, setFitToContainer] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`).matches
      : true,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
    const sync = () => setFitToContainer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const update = () => setWrapperWidth(el.clientWidth || CHART_MIN_WIDTH_FALLBACK);
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const mobileScroll = !fitToContainer;
  const pinnedRightAxis = mobileScroll && rightRail != null;
  const scrollViewportWidth = pinnedRightAxis
    ? Math.max(1, wrapperWidth - VOLUME_AXIS_WIDTH)
    : wrapperWidth;

  const chartWidth = computeChartWidth(
    pointCount,
    scrollViewportWidth,
    fitToContainer ? "fit" : "scroll",
  );
  const isScrollable = mobileScroll && chartWidth > scrollViewportWidth + 2;
  const chartContext: ChartScrollContext = { isScrollable, pinnedRightAxis };

  const chartBody = (
    <div
      className="h-full w-full"
      style={
        isScrollable
          ? { width: chartWidth, minWidth: chartWidth }
          : undefined
      }
    >
      {children(chartWidth, chartContext)}
    </div>
  );

  return (
    <div ref={wrapperRef} className="min-w-0">
      {isScrollable && (
        <p
          className="mb-2 flex items-center justify-center gap-2 rounded-lg border border-ink-line bg-slate-50 px-3 py-2 text-center text-xs text-slate-500 md:hidden"
          aria-hidden="true"
        >
          <span>←</span>
          {MOBILE_HINT}
          <span>→</span>
        </p>
      )}
      {pinnedRightAxis ? (
        <div className="flex h-[260px] w-full min-w-0 sm:h-[360px]">
          <div
            className="chart-scroll h-full min-w-0 flex-1 touch-pan-x overscroll-x-contain"
            aria-label={MOBILE_HINT}
            tabIndex={0}
          >
            {chartBody}
          </div>
          {rightRail(chartContext)}
        </div>
      ) : (
        <div
          className="chart-scroll h-[260px] w-full min-w-0 touch-pan-x overscroll-x-contain sm:h-[360px]"
          aria-label={isScrollable ? MOBILE_HINT : undefined}
          tabIndex={isScrollable ? 0 : undefined}
        >
          {chartBody}
        </div>
      )}
    </div>
  );
}
