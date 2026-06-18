import Link from "next/link";
import { Card } from "@/components/ui";

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
          <Link
            href="/exams"
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white no-underline hover:bg-brand-dark"
          >
            Browse exams
          </Link>
          <Link
            href="/compare"
            className="rounded-lg border border-ink-line bg-white px-4 py-2 font-semibold text-slate-900 no-underline hover:border-brand"
          >
            Compare exams
          </Link>
        </div>
      </Card>
    </div>
  );
}
