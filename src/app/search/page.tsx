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
  let topnotchers: any[] = [];
  let connected = isSupabaseConfigured();
  if (connected && term.length >= 2) {
    try {
      const res = await globalSearch(term);
      schools = res.schools;
      topnotchers = res.topnotchers;
    } catch {
      connected = false;
    }
  }

  return (
    <div className="space-y-6">
      <div className="max-w-xl">
        <SearchBar initial={term} />
      </div>

      {term.length < 2 ? (
        <EmptyState title="Type at least 2 characters to search." />
      ) : (
        <>
          {examMatches.length > 0 && (
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

          {!connected ? (
            <NotConnected />
          ) : (
            <>
              <section>
                <SectionTitle>Schools</SectionTitle>
                {schools.length === 0 ? (
                  <EmptyState title="No matching schools yet." />
                ) : (
                  <div className="grid gap-2">
                    {schools.map((s) => (
                      <Link
                        key={s.id}
                        href={`/schools/${s.id}`}
                        className="rounded-lg border border-ink-line bg-ink-soft p-3 hover:border-brand"
                      >
                        <span className="font-medium text-slate-900">{s.name}</span>
                        {s.regions?.name && (
                          <span className="ml-2 text-xs text-slate-500">{s.regions.name}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {topnotchers.length > 0 && (
                <section>
                  <SectionTitle>Topnotchers</SectionTitle>
                  <Card>
                    <ul className="space-y-1 text-sm">
                      {topnotchers.map((t, i) => (
                        <li key={i} className="text-slate-700">
                          #{(t as any).exam_results?.programs?.exam_code} — {t.name} ({t.school},{" "}
                          {t.rating}%)
                        </li>
                      ))}
                    </ul>
                  </Card>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
