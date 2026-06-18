import Link from "next/link";
import { SearchBar } from "@/components/SearchBar";
import { Card, EmptyState, NotConnected, SectionTitle } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { globalSearch } from "@/lib/queries";
import { PROGRAMS } from "@/lib/programs";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const term = q.trim();

  const lower = term.toLowerCase();
  const examMatches = term
    ? PROGRAMS.filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          p.examCode.toLowerCase().includes(lower) ||
          p.slug.includes(lower),
      )
    : [];

  let schools: any[] = [];
  let connected = isSupabaseConfigured();
  if (connected && term.length >= 2) {
    try {
      const res = await globalSearch(term);
      schools = res.schools;
    } catch {
      connected = false;
    }
  }

  const hasExamMatches = examMatches.length > 0;
  const hasSchoolMatches = schools.length > 0;
  const noResults = term.length >= 2 && !hasExamMatches && !hasSchoolMatches;

  return (
    <div className="space-y-6">
      <div className="max-w-xl">
        <SearchBar initial={term} />
        <p className="mt-1 text-xs text-slate-500">
          Search by exam name or code — e.g. Nursing, Civil Engineering, NLE.
        </p>
      </div>

      {term.length < 2 ? (
        <EmptyState title="Type at least 2 characters to search." />
      ) : noResults && !connected ? (
        <NotConnected />
      ) : noResults ? (
        <EmptyState title="No matching exams or schools." />
      ) : (
        <>
          {hasExamMatches && (
            <section>
              <SectionTitle>Examinations</SectionTitle>
              <div className="grid gap-2 sm:grid-cols-2">
                {examMatches.map((p) => (
                  <Link
                    key={p.examCode}
                    href={`/exams/${p.slug}`}
                    className="rounded-lg border border-ink-line bg-ink-soft p-3 hover:border-brand"
                  >
                    <span className="font-medium text-slate-900">{p.name}</span>{" "}
                    <span className="font-mono text-xs text-slate-500">{p.examCode}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!connected && !hasExamMatches ? (
            <NotConnected />
          ) : hasSchoolMatches ? (
            <section>
              <SectionTitle>Schools</SectionTitle>
              <p className="mb-3 text-xs text-slate-500">
                School search is limited in this MVP — national exam pages have the full
                pass-rate history.
              </p>
              <div className="grid gap-2">
                {schools.map((s) => (
                  <Link
                    key={s.id}
                    href={`/schools/${s.id}`}
                    className="rounded-lg border border-ink-line/80 bg-white p-3 text-sm hover:border-brand"
                  >
                    <span className="font-medium text-slate-800">{s.name}</span>
                    {s.regions?.name && (
                      <span className="ml-2 text-xs text-slate-500">{s.regions.name}</span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {connected && hasExamMatches && !hasSchoolMatches && (
            <Card className="text-sm text-slate-600">
              Looking for national trends? Open an exam above or browse{" "}
              <Link href="/exams" className="text-brand hover:underline">
                all examinations
              </Link>
              .
            </Card>
          )}
        </>
      )}
    </div>
  );
}
