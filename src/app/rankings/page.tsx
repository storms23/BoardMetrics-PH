import { Card, ButtonLink } from "@/components/ui";

export const metadata = { title: "Rankings" };

export default function RankingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-slate-900">School rankings</h1>
      <Card className="max-w-xl space-y-4">
        <p className="text-sm text-slate-700">
          School-level rankings are not part of the current MVP. This launch focuses on
          national exam pass rates, trends, and comparisons across licensure programs.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <ButtonLink href="/exams" className="px-4 py-2">
            Browse exams
          </ButtonLink>
          <ButtonLink href="/compare" variant="secondary" className="px-4 py-2">
            Compare exams
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
