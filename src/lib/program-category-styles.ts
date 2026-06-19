import type { ProgramCategory } from "@/lib/programs";

export const PROGRAM_CATEGORY_STYLES: Record<ProgramCategory, { bg: string; fg: string }> = {
  education: { bg: "bg-sky-100", fg: "text-sky-700" },
  health: { bg: "bg-rose-100", fg: "text-rose-700" },
  engineering: { bg: "bg-slate-200", fg: "text-slate-700" },
  architecture: { bg: "bg-orange-100", fg: "text-orange-700" },
  business: { bg: "bg-violet-100", fg: "text-violet-700" },
  social: { bg: "bg-amber-100", fg: "text-amber-800" },
  agriculture: { bg: "bg-emerald-100", fg: "text-emerald-700" },
};
