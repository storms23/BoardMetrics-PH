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
    <div className={`rounded-xl border border-ink-line bg-ink-soft p-5 ${className}`}>
      {children}
    </div>
  );
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
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  );
}

const LABEL_COLORS: Record<ConsistencyLabel, string> = {
  Excellent: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Very Good": "bg-green-500/15 text-green-300 border-green-500/30",
  Good: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Fair: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Poor: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  "Insufficient data": "bg-slate-500/15 text-slate-400 border-slate-500/30",
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
    value >= 90 ? "text-emerald-300" : value >= 70 ? "text-sky-300" : "text-amber-300";
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
      <div className="text-slate-300">{title}</div>
      {hint && <div className="mt-1 text-sm text-slate-500">{hint}</div>}
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
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
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
    <Link href={`/schools/${id}`} className="font-medium">
      {name}
    </Link>
  );
}
