import "server-only";
import { getServiceClient } from "./supabase/server";

/**
 * Admin data-access + data-verification. Uses the service-role client (bypasses
 * RLS) and must only ever run on the server behind the admin guard.
 */

export async function listImportJobs(limit = 25) {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("import_jobs")
    .select("*, programs(exam_code, name)")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listAuditLogs(limit = 50) {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export interface VerificationReport {
  duplicates: { type: string; count: number; detail: string }[];
  missing: { type: string; count: number; detail: string }[];
  validation: { type: string; count: number; detail: string }[];
}

export async function runVerification(): Promise<VerificationReport> {
  const sb = getServiceClient();

  // Pull the rows we need (MVP scale fits in memory; move to SQL views later).
  const [{ data: perf }, { data: exams }, { data: schools }] = await Promise.all([
    sb.from("school_performance").select("id, takers, passers, pass_rate, exam_result_id, school_id"),
    sb.from("exam_results").select("id, program_id, total_takers, total_passers, pass_rate, year"),
    sb.from("schools").select("id, name"),
  ]);

  const perfRows = perf ?? [];
  const examRows = exams ?? [];
  const schoolRows = schools ?? [];

  // ── Duplicates ──
  const nameMap = new Map<string, number>();
  for (const s of schoolRows) {
    const key = (s.name ?? "").trim().toLowerCase();
    nameMap.set(key, (nameMap.get(key) ?? 0) + 1);
  }
  const dupNames = [...nameMap.values()].filter((c) => c > 1).length;

  const perfKeys = new Map<string, number>();
  for (const p of perfRows) {
    const key = `${p.exam_result_id}:${p.school_id}`;
    perfKeys.set(key, (perfKeys.get(key) ?? 0) + 1);
  }
  const dupPerf = [...perfKeys.values()].filter((c) => c > 1).length;

  // ── Missing data ──
  const examIdsWithSchools = new Set(perfRows.map((p) => p.exam_result_id));
  const examsNoSchools = examRows.filter((e) => !examIdsWithSchools.has(e.id)).length;
  const examsNoNational = examRows.filter(
    (e) => e.total_takers == null || e.total_passers == null,
  ).length;
  const perfMissingRate = perfRows.filter((p) => p.pass_rate == null).length;

  // ── Validation ──
  const badRate = perfRows.filter(
    (p) => p.pass_rate != null && (p.pass_rate < 0 || p.pass_rate > 100),
  ).length;
  const passersGtTakers = perfRows.filter(
    (p) => p.takers != null && p.passers != null && p.passers > p.takers,
  ).length;
  const examRateMismatch = examRows.filter((e) => {
    if (e.total_takers && e.total_passers && e.pass_rate != null) {
      const expected = (e.total_passers / e.total_takers) * 100;
      return Math.abs(expected - e.pass_rate) > 1;
    }
    return false;
  }).length;

  return {
    duplicates: [
      { type: "Duplicate school names", count: dupNames, detail: "Schools sharing a normalized name" },
      { type: "Duplicate performance rows", count: dupPerf, detail: "Same school in the same exam cycle" },
    ],
    missing: [
      { type: "Exam cycles without schools", count: examsNoSchools, detail: "National stats present but no per-school rows" },
      { type: "Exam cycles missing national totals", count: examsNoNational, detail: "Null total_takers/total_passers" },
      { type: "Performance rows missing pass rate", count: perfMissingRate, detail: "Null pass_rate" },
    ],
    validation: [
      { type: "Pass rate out of range", count: badRate, detail: "pass_rate < 0 or > 100" },
      { type: "Passers exceed examinees", count: passersGtTakers, detail: "passers > takers" },
      { type: "National rate mismatch", count: examRateMismatch, detail: "Stored rate differs from passers/takers by >1%" },
    ],
  };
}
