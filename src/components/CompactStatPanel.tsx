import { Card } from "@/components/ui";

export function CompactStatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-1.5 border-b border-ink-line/50 py-1.5 last:border-b-0">
      <div className="mt-px shrink-0 text-slate-400 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="text-xs font-semibold tabular-nums text-slate-900">{value}</div>
      </div>
    </div>
  );
}

export function CompactStatPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-2.5">
      <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
        {title}
      </h3>
      {children}
    </Card>
  );
}

export function CompactStatDivider() {
  return <div className="my-1 border-t border-ink-line" />;
}
