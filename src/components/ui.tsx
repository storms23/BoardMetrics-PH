import Link from "next/link";
import type { ConsistencyLabel } from "@/lib/types";

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

function StatValue({ value }: { value: React.ReactNode }) {
  if (typeof value === "string" || typeof value === "number") {
    return <span className="text-slate-950">{value}</span>;
  }
  return <>{value}</>;
}

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <Card className="text-center">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-600">
        {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums text-slate-950">
        <StatValue value={value} />
      </div>
      {sub && <div className="mt-1 text-xs text-slate-600">{sub}</div>}
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

export function PassRate({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-500">—</span>;
  const color =
    value >= 90 ? "text-emerald-700" : value >= 70 ? "text-sky-700" : "text-amber-700";
  return <span className={`font-semibold ${color}`}>{value.toFixed(2)}%</span>;
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
