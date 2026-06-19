import Link from "next/link";
import type { ConsistencyLabel } from "@/lib/types";
import type { TrendLabel } from "@/lib/exam-tracker";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-ink-line bg-ink-soft p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function StatValue({
  value,
  valueTone = "neutral",
}: {
  value: React.ReactNode;
  valueTone?: "neutral" | "pass" | "fail" | "highlight";
}) {
  if (typeof value === "string" || typeof value === "number") {
    const color =
      valueTone === "pass"
        ? "text-emerald-700"
        : valueTone === "fail"
          ? "text-rose-700"
          : valueTone === "highlight"
            ? "text-amber-700"
            : "text-slate-900";
    return <span className={color}>{value}</span>;
  }
  return <>{value}</>;
}

export function StatCard({
  label,
  value,
  sub,
  compact = false,
  tone = "neutral",
  valueTone,
  variant = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  /** Tighter padding and type — exam KPI rows with many cards */
  compact?: boolean;
  tone?: "neutral" | "pass" | "fail" | "highlight";
  /** Color for plain string/number values (e.g. volume totals) */
  valueTone?: "neutral" | "pass" | "fail" | "highlight";
  /** hero = top rate row; summary = bottom volume strip */
  variant?: "default" | "hero" | "summary";
}) {
  const toneClass =
    tone === "pass"
      ? "border-l-[3px] border-l-emerald-500 bg-emerald-50/40"
      : tone === "fail"
        ? "border-l-[3px] border-l-rose-500 bg-rose-50/45"
        : tone === "highlight"
          ? "border-l-[3px] border-l-amber-500 bg-amber-50/35"
          : "";

  const isHero = variant === "hero";
  const isSummary = variant === "summary";

  const pad = isHero ? "p-3" : isSummary ? "p-2.5" : compact ? "p-2.5" : "";
  const minH = isHero ? "min-h-[96px]" : isSummary ? "min-h-[84px]" : compact ? "min-h-[92px]" : "min-h-[132px]";
  const labelClass = isHero
    ? "min-h-[20px] text-[10px] leading-snug"
    : isSummary
      ? "min-h-[18px] text-[10px] leading-snug"
      : compact
        ? "min-h-[22px] text-[10px] leading-snug"
        : "min-h-[30px] text-xs";
  const valueClass = isHero
    ? "min-h-[34px] text-xl"
    : isSummary
      ? "min-h-[30px] text-lg"
      : compact
        ? "min-h-[32px] text-lg"
        : "min-h-[44px] text-2xl";
  const subClass = isHero
    ? "mt-0.5 min-h-[16px] text-[10px] leading-snug"
    : isSummary
      ? "mt-0.5 min-h-[16px] text-[10px] leading-snug"
      : compact
        ? "mt-0.5 min-h-[18px] text-[10px] leading-snug"
        : "mt-1 min-h-[30px] text-xs";

  return (
    <Card className={`flex flex-col text-center ${pad} ${toneClass} ${minH}`}>
      <div className={`font-bold uppercase tracking-wider text-slate-700 ${labelClass}`}>
        {label}
      </div>
      <div
        className={`flex items-center justify-center font-extrabold tabular-nums ${valueClass}`}
      >
        <StatValue value={value} valueTone={valueTone} />
      </div>
      <div className={`text-slate-600 ${subClass}`}>{sub ?? ""}</div>
    </Card>
  );
}

const LABEL_COLORS: Record<ConsistencyLabel, string> = {
  Excellent: "bg-emerald-50 text-emerald-800 border-emerald-200",
  "Very Good": "bg-green-50 text-green-800 border-green-200",
  Good: "bg-sky-50 text-sky-800 border-sky-200",
  Fair: "bg-amber-50 text-amber-800 border-amber-200",
  Poor: "bg-rose-50 text-rose-800 border-rose-200",
  "Insufficient data": "bg-slate-100 text-slate-700 border-slate-200",
};

export function ConsistencyBadge({ label }: { label: ConsistencyLabel }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${LABEL_COLORS[label]}`}
    >
      {label}
    </span>
  );
}

const TREND_COLORS: Record<TrendLabel, string> = {
  Improving: "bg-emerald-50 text-emerald-800 border-emerald-200",
  Stable: "bg-sky-50 text-sky-800 border-sky-200",
  Declining: "bg-amber-50 text-amber-800 border-amber-200",
  "Insufficient data": "bg-slate-100 text-slate-700 border-slate-200",
};

export function TrendLabelBadge({ label }: { label: TrendLabel }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TREND_COLORS[label]}`}
    >
      {label}
    </span>
  );
}

export function CoverageBadge({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">
      {label}
    </span>
  );
}

/** Prominent 10-year tracker scope — cycle count + year range */
export function TrackerScope({
  cycleCount,
  yearFrom,
  yearTo,
  windowYears,
}: {
  cycleCount: number;
  yearFrom: number;
  yearTo: number;
  windowYears: number;
}) {
  return (
    <div className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border border-brand/25 bg-brand/5 px-3 py-2">
      <span className="text-sm font-bold tabular-nums tracking-tight text-slate-900">
        {cycleCount} cycle{cycleCount === 1 ? "" : "s"} · {yearFrom}–{yearTo}
      </span>
      <span className="text-xs font-medium text-slate-500">
        {windowYears}-year window
      </span>
    </div>
  );
}

export function DataStatusBadge({
  status,
}: {
  status: "ok" | "partial" | "none";
}) {
  const styles = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    partial: "border-amber-200 bg-amber-50 text-amber-800",
    none: "border-slate-200 bg-slate-100 text-slate-600",
  };
  const labels = {
    ok: "Data available",
    partial: "Incomplete data",
    none: "No national data yet",
  };
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export function DeltaPts({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-500">—</span>;
  const color =
    value > 0 ? "text-emerald-700" : value < 0 ? "text-amber-700" : "text-slate-600";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`font-medium tabular-nums ${color}`}>
      {sign}
      {value.toFixed(1)} pts
    </span>
  );
}

/** Pass rate gradient — national results table only (readable greens, ~20% spread). */
export function passRateGradientClass(value: number): string {
  if (value >= 75) return "text-emerald-700";
  if (value >= 50) return "text-emerald-600";
  return "text-emerald-500";
}

/** Failed rate gradient — national results table only (readable reds, ~20% spread). */
export function failedRateGradientClass(value: number): string {
  if (value >= 50) return "text-rose-700";
  if (value >= 25) return "text-rose-600";
  return "text-rose-500";
}

export function PassRate({
  value,
  variant = "default",
}: {
  value: number | null;
  /** Use `gradient` only in the national results table. */
  variant?: "default" | "gradient";
}) {
  if (value == null) return <span className="text-slate-500">—</span>;
  const color =
    variant === "gradient"
      ? passRateGradientClass(value)
      : value >= 90
        ? "text-emerald-700"
        : value >= 70
          ? "text-sky-700"
          : "text-amber-700";
  return (
    <span className={`font-semibold tabular-nums ${color}`}>{value.toFixed(2)}%</span>
  );
}

export function FailedRate({
  value,
  variant = "default",
}: {
  value: number | null;
  /** Use `gradient` only in the national results table. */
  variant?: "default" | "gradient";
}) {
  if (value == null) return <span className="text-slate-500">—</span>;
  const color =
    variant === "gradient"
      ? failedRateGradientClass(value)
      : value <= 10
        ? "text-emerald-700"
        : value <= 30
          ? "text-amber-700"
          : "text-rose-700";
  return (
    <span className={`font-semibold tabular-nums ${color}`}>{value.toFixed(2)}%</span>
  );
}

/** Colored pill for rate column headers in national results tables */
export function RateColumnHeader({
  kind,
  children,
}: {
  kind: "pass" | "fail";
  children: React.ReactNode;
}) {
  const styles =
    kind === "pass"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-rose-100 text-rose-800";
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <Card className="text-center">
      <div className="text-slate-800">{title}</div>
      {hint && <div className="mt-1 text-sm text-slate-600">{hint}</div>}
    </Card>
  );
}

export function NotConnected() {
  return (
    <EmptyState
      title="Data source not connected yet"
      hint="Add your Supabase keys to .env.local and run the scraper to populate results."
    />
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600">
      {children}
    </h2>
  );
}

export function SchoolLink({
  id,
  name,
}: {
  id: number;
  name: string;
}) {
  return (
    <Link
      href={`/schools/${id}`}
      className="no-underline-link font-medium text-brand hover:text-brand-dark"
    >
      {name}
    </Link>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: "primary" | "secondary";
  className?: string;
  children: React.ReactNode;
}) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold no-underline-link";
  const variantClass =
    variant === "primary"
      ? "bg-brand text-white hover:bg-brand-dark"
      : "border border-ink-line bg-white text-slate-700 hover:border-brand";

  return (
    <Link href={href} className={`${base} ${variantClass} ${className}`.trim()}>
      {children}
    </Link>
  );
}
