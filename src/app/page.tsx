import Link from "next/link";
import { PROGRAMS } from "@/lib/programs";
import { SearchBar } from "@/components/SearchBar";

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="space-y-5 py-8 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          PRC board exam results,
          <br />
          <span className="text-brand-light">searchable and analyzable.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-slate-400">
          Pass rates, rankings, trends, and consistency scores for{" "}
          {PROGRAMS.length} licensure programs — by school, exam, year, and
          region.
        </p>
        <div className="mx-auto max-w-xl">
          <SearchBar />
        </div>
        <p className="text-xs text-slate-500">
          Try: “University of Santo Tomas Nursing 2025” · “Civil Engineering
          2024” · “NCR Nursing Schools”
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Browse by examination
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {PROGRAMS.map((p) => (
            <Link
              key={p.examCode}
              href={`/exams/${p.slug}`}
              className="rounded-xl border border-ink-line bg-ink-soft p-4 transition-colors hover:border-brand"
            >
              <div className="text-sm font-semibold text-white">
                {p.name.replace(" Licensure Examination", "")}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-500">
                {p.examCode}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
