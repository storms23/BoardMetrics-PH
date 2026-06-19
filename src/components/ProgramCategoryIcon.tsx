import type { ProgramCategory } from "@/lib/programs";
import { PROGRAM_CATEGORY_STYLES } from "@/lib/program-category-styles";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Calculator,
  Cog,
  GraduationCap,
  HeartPulse,
  Shield,
  Sprout,
} from "lucide-react";

const ICONS: Record<ProgramCategory, LucideIcon> = {
  education: GraduationCap,
  health: HeartPulse,
  engineering: Cog,
  architecture: Building2,
  business: Calculator,
  social: Shield,
  agriculture: Sprout,
};

export function ProgramCategoryIcon({
  category,
  size = "md",
}: {
  category: ProgramCategory;
  size?: "sm" | "md";
}) {
  const { bg, fg } = PROGRAM_CATEGORY_STYLES[category];
  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const iconSize = size === "sm" ? 14 : 16;
  const Icon = ICONS[category];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg ${box} ${bg} ${fg}`}
      aria-hidden
    >
      <Icon size={iconSize} strokeWidth={2.25} aria-hidden />
    </span>
  );
}
