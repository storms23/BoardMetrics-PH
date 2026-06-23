"use client";

export const VOLUME_AXIS_WIDTH = 52;
const TOP_MARGIN = 16;

function formatVolumeTick(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value);
}

function volumeAxisTicks(domainMax: number): number[] {
  if (domainMax <= 0) return [0];
  return [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(domainMax * f));
}

/** Fixed right rail for examinee count — HTML ticks aligned to chart margins. */
export function VolumeYAxisRail({
  domainMax,
  bottomMargin,
  stroke,
}: {
  domainMax: number;
  bottomMargin: number;
  stroke: string;
}) {
  const ticks = volumeAxisTicks(domainMax);

  return (
    <div
      className="relative h-[260px] shrink-0 border-l border-slate-200 bg-white sm:h-[360px]"
      style={{ width: VOLUME_AXIS_WIDTH }}
      aria-hidden
    >
      <div
        className="flex h-full flex-col text-right text-[11px] leading-none font-medium tabular-nums"
        style={{ paddingTop: TOP_MARGIN, paddingBottom: bottomMargin, color: stroke }}
      >
        <div className="flex flex-1 flex-col justify-between pr-1">
          {[...ticks].reverse().map((value) => (
            <span key={value}>{formatVolumeTick(value)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
