import { getServerClient } from "./supabase/server";
import { computeConsistency, classifyTrend } from "./consistency";

/**
 * Shared data-access functions used by both /api/v1 route handlers and server
 * components. Ports the logic from the reference FastAPI api.py to typed
 * Supabase queries. Heavy aggregations are done in JS for the MVP; hot paths
 * can later be moved to Postgres views/RPC without changing call sites.
 */

export interface RankingFilters {
  examCode: string;
  year?: number;
  month?: string;
  region?: string;
  minTakers?: number;
  limit?: number;
}

// ─── EXAMS ─────────────────────────────────────────────────────────────────
export async function listExams() {
  const sb = getServerClient();
  const { data, error } = await sb
    .from("exam_results")
    .select("year, pass_rate, total_takers, programs!inner(exam_code, name, slug)");
  if (error) throw error;

  const grouped = new Map<string, any>();
  for (const r of data ?? []) {
    const p = (r as any).programs;
    const code = p.exam_code;
    const g = grouped.get(code) ?? {
      exam_code: code,
      exam_fullname: p.name,
      slug: p.slug,
      total_cycles: 0,
      years: [] as number[],
      rates: [] as number[],
      all_time_takers: 0,
    };
    g.total_cycles += 1;
    g.years.push(r.year);
    if (r.pass_rate != null) g.rates.push(r.pass_rate);
    g.all_time_takers += r.total_takers ?? 0;
    grouped.set(code, g);
  }

  return [...grouped.values()].map((g) => ({
    exam_code: g.exam_code,
    exam_fullname: g.exam_fullname,
    slug: g.slug,
    total_cycles: g.total_cycles,
    latest_year: Math.max(...g.years),
    earliest_year: Math.min(...g.years),
    avg_national_pass_rate: g.rates.length
      ? Math.round((g.rates.reduce((a: number, b: number) => a + b, 0) / g.rates.length) * 100) / 100
      : null,
    all_time_takers: g.all_time_takers,
  }));
}

export async function getExamHistory(examCode: string, year?: number, month?: string) {
  const sb = getServerClient();
  let q = sb
    .from("exam_results")
    .select("*, programs!inner(exam_code, name, slug)")
    .ilike("programs.exam_code", examCode);
  if (year) q = q.eq("year", year);
  if (month) q = q.ilike("month", `%${month}%`);
  const { data, error } = await q.order("year", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function examTopSchools(
  examCode: string,
  year?: number,
  month?: string,
  limit = 20,
) {
  const sb = getServerClient();
  let q = sb
    .from("school_performance")
    .select(
      "rank, takers, passers, pass_rate, schools!inner(id, name, slug, regions(name, code)), exam_results!inner(year, month, pass_rate, programs!inner(exam_code))",
    )
    .ilike("exam_results.programs.exam_code", examCode);
  if (year) q = q.eq("exam_results.year", year);
  if (month) q = q.ilike("exam_results.month", `%${month}%`);
  const { data, error } = await q.order("rank", { ascending: true }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    rank: r.rank,
    school: r.schools.name,
    school_id: r.schools.id,
    slug: r.schools.slug,
    region: r.schools.regions?.name ?? null,
    takers: r.takers,
    passers: r.passers,
    pass_rate: r.pass_rate,
    year: r.exam_results.year,
    month: r.exam_results.month,
    national_rate: r.exam_results.pass_rate,
    gap:
      r.pass_rate != null && r.exam_results.pass_rate != null
        ? Math.round((r.pass_rate - r.exam_results.pass_rate) * 100) / 100
        : null,
  }));
}

// ─── SCHOOLS ───────────────────────────────────────────────────────────────
export async function listSchools(opts: {
  search?: string;
  region?: string;
  page?: number;
  perPage?: number;
}) {
  const sb = getServerClient();
  const page = opts.page ?? 1;
  const perPage = opts.perPage ?? 20;
  const from = (page - 1) * perPage;

  let q = sb
    .from("schools")
    .select("id, name, slug, school_type, regions(name, code)", { count: "exact" });
  if (opts.search) q = q.ilike("name", `%${opts.search}%`);
  if (opts.region) q = q.ilike("regions.name", `%${opts.region}%`);

  const { data, count, error } = await q
    .order("name", { ascending: true })
    .range(from, from + perPage - 1);
  if (error) throw error;

  return {
    total: count ?? 0,
    page,
    pages: Math.ceil((count ?? 0) / perPage),
    data: data ?? [],
  };
}

export async function getSchoolProfile(schoolId: number) {
  const sb = getServerClient();
  const { data: school, error: se } = await sb
    .from("schools")
    .select("*, regions(name, code), provinces(name)")
    .eq("id", schoolId)
    .maybeSingle();
  if (se) throw se;
  if (!school) return null;

  const { data: history, error: he } = await sb
    .from("school_performance")
    .select(
      "takers, passers, pass_rate, rank, exam_results!inner(year, month, pass_rate, programs!inner(exam_code, name, slug))",
    )
    .eq("school_id", schoolId)
    .order("exam_results(year)", { ascending: false });
  if (he) throw he;

  const flat = (history ?? []).map((r: any) => ({
    exam_code: r.exam_results.programs.exam_code,
    exam_fullname: r.exam_results.programs.name,
    slug: r.exam_results.programs.slug,
    month: r.exam_results.month,
    year: r.exam_results.year,
    takers: r.takers,
    passers: r.passers,
    pass_rate: r.pass_rate,
    rank: r.rank,
    national_rate: r.exam_results.pass_rate,
    gap_from_national:
      r.pass_rate != null && r.exam_results.pass_rate != null
        ? Math.round((r.pass_rate - r.exam_results.pass_rate) * 100) / 100
        : null,
  }));

  const rates = flat.map((r) => r.pass_rate).filter((x): x is number => x != null);
  const above = flat.filter(
    (r) => r.pass_rate != null && r.national_rate != null && r.pass_rate > r.national_rate,
  ).length;
  const consistency = computeConsistency(rates, above);

  return {
    school,
    summary: {
      exams_participated: flat.length,
      avg_pass_rate: rates.length
        ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100
        : null,
      consistency_score: consistency?.score ?? null,
      consistency_label: consistency?.label ?? "Insufficient data",
      times_above_national: above,
      best_pass_rate: rates.length ? Math.max(...rates) : null,
      worst_pass_rate: rates.length ? Math.min(...rates) : null,
    },
    history: flat,
  };
}

export async function schoolTopnotchers(schoolId: number) {
  const sb = getServerClient();
  const { data: school } = await sb
    .from("schools")
    .select("name")
    .eq("id", schoolId)
    .maybeSingle();
  if (!school) return null;
  const { data, error } = await sb
    .from("topnotchers")
    .select("rank, name, rating, exam_results!inner(year, month, programs!inner(exam_code, name))")
    .ilike("school", `%${school.name}%`)
    .order("exam_results(year)", { ascending: false });
  if (error) throw error;
  return { school: school.name, topnotchers: data ?? [] };
}

// ─── RANKINGS ──────────────────────────────────────────────────────────────
export async function getRankings(f: RankingFilters) {
  const sb = getServerClient();
  let q = sb
    .from("school_performance")
    .select(
      "rank, takers, passers, pass_rate, schools!inner(id, name, slug, regions(name, code), provinces(name)), exam_results!inner(year, month, pass_rate, programs!inner(exam_code))",
    )
    .ilike("exam_results.programs.exam_code", f.examCode);
  if (f.year) q = q.eq("exam_results.year", f.year);
  if (f.month) q = q.ilike("exam_results.month", `%${f.month}%`);
  if (f.region) q = q.ilike("schools.regions.name", `%${f.region}%`);
  if (f.minTakers) q = q.gte("takers", f.minTakers);

  const { data, error } = await q.order("rank", { ascending: true }).limit(f.limit ?? 50);
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    rank: r.rank,
    school: r.schools.name,
    school_id: r.schools.id,
    slug: r.schools.slug,
    region: r.schools.regions?.name ?? null,
    province: r.schools.provinces?.name ?? null,
    takers: r.takers,
    passers: r.passers,
    pass_rate: r.pass_rate,
    year: r.exam_results.year,
    month: r.exam_results.month,
    national_rate: r.exam_results.pass_rate,
  }));
}

// ─── TOPNOTCHERS ───────────────────────────────────────────────────────────
export async function listTopnotchers(opts: {
  examCode?: string;
  year?: number;
  school?: string;
  limit?: number;
}) {
  const sb = getServerClient();
  let q = sb
    .from("topnotchers")
    .select("rank, name, school, rating, exam_results!inner(year, month, programs!inner(exam_code, name))");
  if (opts.examCode) q = q.ilike("exam_results.programs.exam_code", opts.examCode);
  if (opts.year) q = q.eq("exam_results.year", opts.year);
  if (opts.school) q = q.ilike("school", `%${opts.school}%`);
  const { data, error } = await q
    .order("exam_results(year)", { ascending: false })
    .order("rank", { ascending: true })
    .limit(opts.limit ?? 50);
  if (error) throw error;
  return data ?? [];
}

// ─── SEARCH ────────────────────────────────────────────────────────────────
export async function globalSearch(term: string) {
  const sb = getServerClient();
  const [schools, topnotchers] = await Promise.all([
    sb.from("schools").select("id, name, slug, regions(name)").ilike("name", `%${term}%`).limit(10),
    sb
      .from("topnotchers")
      .select("name, school, rating, exam_results!inner(year, programs!inner(exam_code))")
      .ilike("name", `%${term}%`)
      .limit(5),
  ]);
  return {
    query: term,
    schools: schools.data ?? [],
    topnotchers: topnotchers.data ?? [],
  };
}

// ─── COMPARE ───────────────────────────────────────────────────────────────
export async function compareSchools(ids: number[], examCode?: string) {
  const result: Record<string, any> = {};
  for (const id of ids) {
    const profile = await getSchoolProfile(id);
    if (!profile) continue;
    const history = examCode
      ? profile.history.filter((h) => h.exam_code.toUpperCase() === examCode.toUpperCase())
      : profile.history;
    result[(profile.school as any).name] = {
      school_id: id,
      summary: profile.summary,
      history,
    };
  }
  return result;
}

// ─── REGIONS ───────────────────────────────────────────────────────────────
export async function regionalAnalytics(examCode?: string, year?: number) {
  const sb = getServerClient();
  let q = sb
    .from("school_performance")
    .select(
      "passers, takers, pass_rate, schools!inner(id, regions!inner(name)), exam_results!inner(year, programs!inner(exam_code))",
    );
  if (examCode) q = q.ilike("exam_results.programs.exam_code", examCode);
  if (year) q = q.eq("exam_results.year", year);
  const { data, error } = await q;
  if (error) throw error;

  const grouped = new Map<string, any>();
  for (const r of data ?? []) {
    const region = (r as any).schools.regions.name as string;
    const g = grouped.get(region) ?? {
      region,
      schools: new Set<number>(),
      rates: [] as number[],
      passers: 0,
      takers: 0,
    };
    g.schools.add((r as any).schools.id);
    if (r.pass_rate != null) g.rates.push(r.pass_rate);
    g.passers += r.passers ?? 0;
    g.takers += r.takers ?? 0;
    grouped.set(region, g);
  }
  return [...grouped.values()]
    .map((g) => ({
      region: g.region,
      schools: g.schools.size,
      avg_pass_rate: g.rates.length
        ? Math.round((g.rates.reduce((a: number, b: number) => a + b, 0) / g.rates.length) * 100) / 100
        : null,
      total_passers: g.passers,
      total_takers: g.takers,
    }))
    .sort((a, b) => (b.avg_pass_rate ?? 0) - (a.avg_pass_rate ?? 0));
}

// ─── ANALYTICS ─────────────────────────────────────────────────────────────
export async function schoolTrend(schoolId: number, examCode?: string) {
  const sb = getServerClient();
  let q = sb
    .from("school_performance")
    .select("pass_rate, rank, exam_results!inner(year, month, pass_rate, programs!inner(exam_code))")
    .eq("school_id", schoolId);
  if (examCode) q = q.ilike("exam_results.programs.exam_code", examCode);
  const { data, error } = await q.order("exam_results(year)", { ascending: true });
  if (error) throw error;

  const flat = (data ?? []).map((r: any) => ({
    year: r.exam_results.year,
    month: r.exam_results.month,
    exam_code: r.exam_results.programs.exam_code,
    school_rate: r.pass_rate,
    national_rate: r.exam_results.pass_rate,
    rank: r.rank,
  }));
  const rates = flat.map((r) => r.school_rate).filter((x): x is number => x != null);
  return { trend: classifyTrend(rates), data: flat };
}

export async function examDifficulty(examCode: string) {
  const sb = getServerClient();
  const { data, error } = await sb
    .from("exam_results")
    .select("year, month, pass_rate, total_takers, programs!inner(exam_code)")
    .ilike("programs.exam_code", examCode)
    .order("year", { ascending: true });
  if (error) throw error;
  const flat = (data ?? []).map((r: any) => ({
    year: r.year,
    month: r.month,
    national_pass_rate: r.pass_rate,
    total_takers: r.total_takers,
  }));
  const rates = flat.map((r) => r.national_pass_rate).filter((x): x is number => x != null);
  return {
    exam_code: examCode,
    data: flat,
    avg_rate: rates.length
      ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100
      : null,
    highest_rate: rates.length ? Math.max(...rates) : null,
    lowest_rate: rates.length ? Math.min(...rates) : null,
  };
}

// ─── LEADERBOARD (analytics #9) ──────────────────────────────────────────────
export async function topByConsistency(limit = 25) {
  const sb = getServerClient();
  const { data, error } = await sb
    .from("consistency_scores")
    .select("score, label, avg_rate, years, schools!inner(id, name, slug, regions(name)), programs!inner(exam_code, name)")
    .order("score", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    school: r.schools.name,
    school_id: r.schools.id,
    region: r.schools.regions?.name ?? null,
    exam_code: r.programs.exam_code,
    score: r.score,
    label: r.label,
    avg_rate: r.avg_rate,
    years: r.years,
  }));
}

// ─── EXAM POPULARITY (analytics #6) ──────────────────────────────────────────
export async function examPopularity() {
  const exams = await listExams();
  return exams
    .map((e) => ({
      exam_code: e.exam_code,
      exam_fullname: e.exam_fullname,
      slug: e.slug,
      all_time_takers: e.all_time_takers,
      cycles: e.total_cycles,
    }))
    .sort((a, b) => b.all_time_takers - a.all_time_takers);
}

// ─── DISTRIBUTION (analytics #10) ────────────────────────────────────────────
export async function passRateDistribution(examCode: string, year?: number) {
  const schools = await examTopSchools(examCode, year, undefined, 1000);
  const bands = { "90-100%": 0, "80-89%": 0, "70-79%": 0, "Below 70%": 0 };
  for (const s of schools) {
    const pr = s.pass_rate;
    if (pr == null) continue;
    if (pr >= 90) bands["90-100%"]++;
    else if (pr >= 80) bands["80-89%"]++;
    else if (pr >= 70) bands["70-79%"]++;
    else bands["Below 70%"]++;
  }
  return Object.entries(bands).map(([band, count]) => ({ band, count }));
}
