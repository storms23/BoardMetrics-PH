import type { ProgramCategory, ProgramIconKey } from "@/lib/programs";
import { PROGRAM_CATEGORY_STYLES } from "@/lib/program-category-styles";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Brain,
  Building2,
  Calculator,
  Compass,
  Cpu,
  FlaskConical,
  GraduationCap,
  HardHat,
  Cog,
  Fingerprint,
  HeartPulse,
  Pill,
  Sprout,
  Stethoscope,
  Zap,
} from "lucide-react";

const PROGRAM_ICONS: Record<ProgramIconKey, LucideIcon> = {
  "teacher-elementary": BookOpen,
  "teacher-secondary": GraduationCap,
  accounting: Calculator,
  nursing: HeartPulse,
  criminology: Fingerprint,
  "civil-engineering": HardHat,
  "electronics-engineering": Cpu,
  "electrical-engineering": Zap,
  "mechanical-engineering": Cog,
  medicine: Stethoscope,
  "medical-technology": FlaskConical,
  architecture: Compass,
  pharmacy: Pill,
  psychology: Brain,
  agriculture: Sprout,
};

export function ProgramIcon({
  iconKey,
  category,
  size = "md",
}: {
  iconKey: ProgramIconKey;
  category: ProgramCategory;
  size?: "sm" | "md";
}) {
  const { bg, fg } = PROGRAM_CATEGORY_STYLES[category];
  const box = size === "sm" ? "h-10 w-10" : "h-11 w-11";
  const iconSize = size === "sm" ? 18 : 20;
  const Icon = PROGRAM_ICONS[iconKey];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl ${box} ${bg} ${fg}`}
      aria-hidden
    >
      <Icon size={iconSize} strokeWidth={2.25} aria-hidden />
    </span>
  );
}
