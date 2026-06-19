import { Card, ButtonLink } from "@/components/ui";

export const metadata = { title: "Leaderboard" };

export default function LeaderboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-slate-900">Leaderboard</h1>
      <Card className="max-w-xl space-y-4">
        <p className="text-sm text-slate-700">
          School leaderboards are not part of the current MVP. Use national exam pages to
          explore pass-rate history, difficulty trends, and program comparisons.
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
