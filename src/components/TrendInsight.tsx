import { Lightbulb } from "lucide-react";
import { Card } from "@/components/ui";

export function TrendInsight({
  text,
  sourceHint,
}: {
  text: string;
  sourceHint?: string | null;
}) {
  return (
    <Card className="border-brand/20 bg-brand/5 p-4">
      <div className="flex gap-3">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 space-y-2">
          <p className="text-sm leading-relaxed text-slate-800">{text}</p>
          <p className="text-xs text-slate-500">
            Based on complete national cycles in the table above.
            {sourceHint ? ` ${sourceHint}` : ""}
          </p>
        </div>
      </div>
    </Card>
  );
}
