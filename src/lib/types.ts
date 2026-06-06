/** Shared domain types mirroring the Supabase schema (supabase/migrations). */

export interface Region {
  id: number;
  name: string;
  code: string | null;
}

export interface Province {
  id: number;
  region_id: number;
  name: string;
}

export interface School {
  id: number;
  name: string;
  slug: string;
  region_id: number | null;
  province_id: number | null;
  school_type: string | null;
}

export interface ProgramRow {
  id: number;
  exam_code: string;
  name: string;
  level: string | null;
  slug: string;
  is_active: boolean;
}

export interface ExamResult {
  id: number;
  program_id: number;
  exam_code?: string;
  month: string | null;
  year: number;
  total_takers: number | null;
  total_passers: number | null;
  pass_rate: number | null;
  source_url: string | null;
}

export interface SchoolPerformance {
  id: number;
  exam_result_id: number;
  school_id: number;
  takers: number | null;
  passers: number | null;
  pass_rate: number | null;
  rank: number | null;
}

export interface Topnotcher {
  id: number;
  exam_result_id: number;
  rank: number;
  name: string;
  school: string | null;
  rating: number | null;
}

export interface ConsistencyScore {
  school_id: number;
  program_id: number;
  avg_rate: number | null;
  volatility: number | null;
  score: number | null;
  label: ConsistencyLabel | null;
  years: number | null;
}

export type ConsistencyLabel =
  | "Excellent"
  | "Very Good"
  | "Good"
  | "Fair"
  | "Poor"
  | "Insufficient data";

export interface Paginated<T> {
  total: number;
  page: number;
  pages: number;
  data: T[];
}
