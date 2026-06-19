import Link from "next/link";
import type { Program } from "@/lib/programs";
import { PROGRAM_CATEGORY_LABELS } from "@/lib/programs";
import { ProgramIcon } from "@/components/ProgramIcon";
function shortName(name: string): string {
  return name.replace(" Licensure Examination", "");
}

export function ExamBrowseCard({ program }: { program: Program }) {
  return (
    <Link
      href={`/exams/${program.slug}`}
      className="flex h-full gap-3 rounded-xl border border-ink-line bg-ink-soft p-4 shadow-sm transition-colors hover:border-brand"
    >
      <ProgramIcon iconKey={program.iconKey} category={program.category} size="sm" />
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-snug text-slate-900">
          {shortName(program.name)}
        </div>
        <div className="mt-1 font-mono text-xs text-slate-500">{program.examCode}</div>
        <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {PROGRAM_CATEGORY_LABELS[program.category]}
        </div>
      </div>    </Link>
  );
}
