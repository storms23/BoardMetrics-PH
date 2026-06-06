import { Card, SectionTitle } from "@/components/ui";

export const metadata = { title: "API Documentation" };

interface Endpoint {
  method: string;
  path: string;
  desc: string;
  example: string;
}

const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/api/v1/exams", desc: "All programs with summary statistics.", example: "/api/v1/exams" },
  { method: "GET", path: "/api/v1/exams/{code}", desc: "History of one exam. Filter by year, month.", example: "/api/v1/exams/NLE?year=2025" },
  { method: "GET", path: "/api/v1/exams/{code}/top-schools", desc: "Top schools for an exam cycle.", example: "/api/v1/exams/CPALE/top-schools?limit=20" },
  { method: "GET", path: "/api/v1/schools", desc: "Search/list schools (paginated).", example: "/api/v1/schools?search=santo+tomas&page=1" },
  { method: "GET", path: "/api/v1/schools/{id}", desc: "School profile: summary, consistency, history.", example: "/api/v1/schools/1" },
  { method: "GET", path: "/api/v1/schools/{id}/topnotchers", desc: "Topnotchers from a school.", example: "/api/v1/schools/1/topnotchers" },
  { method: "GET", path: "/api/v1/rankings", desc: "Rankings with filters (exam_code required).", example: "/api/v1/rankings?exam_code=NLE&year=2025&region=NCR&min_takers=50" },
  { method: "GET", path: "/api/v1/topnotchers", desc: "Topnotchers, filterable.", example: "/api/v1/topnotchers?exam_code=CPALE&year=2025" },
  { method: "GET", path: "/api/v1/search", desc: "Global search across schools/exams/topnotchers.", example: "/api/v1/search?q=UST+Nursing" },
  { method: "GET", path: "/api/v1/compare", desc: "Compare multiple schools.", example: "/api/v1/compare?school_ids=1,2,3" },
  { method: "GET", path: "/api/v1/regions", desc: "Regional performance analytics.", example: "/api/v1/regions?exam_code=NLE" },
  { method: "GET", path: "/api/v1/analytics/trend", desc: "School trend (line-chart data).", example: "/api/v1/analytics/trend?school_id=1&exam_code=NLE" },
  { method: "GET", path: "/api/v1/analytics/difficulty", desc: "Exam difficulty over time.", example: "/api/v1/analytics/difficulty?exam_code=NLE" },
  { method: "GET", path: "/api/v1/analytics/distribution", desc: "Pass-rate distribution bands.", example: "/api/v1/analytics/distribution?exam_code=NLE" },
  { method: "GET", path: "/api/v1/export", desc: "Export CSV/Excel (rankings, exam_top, regions, exams).", example: "/api/v1/export?type=rankings&exam_code=NLE&format=csv" },
];

export default function ApiDocsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Public API</h1>
        <p className="mt-1 text-sm text-slate-400">
          REST endpoints under <code className="text-brand-light">/api/v1</code>. JSON responses,
          pagination, filtering, sorting, and rate limiting. Machine-readable spec at{" "}
          <a href="/api/v1/openapi.json">/api/v1/openapi.json</a>.
        </p>
      </div>

      <Card>
        <SectionTitle>Conventions</SectionTitle>
        <ul className="space-y-1 text-sm text-slate-300">
          <li>
            <strong>Pagination:</strong> <code>page</code>, <code>per_page</code> (max 100).
          </li>
          <li>
            <strong>Sorting:</strong> <code>sort=field.desc</code> where supported.
          </li>
          <li>
            <strong>Rate limiting:</strong> per IP; <code>429</code> with <code>Retry-After</code> on
            exceed. Send <code>X-API-Key</code> for the partner tier (10x limit).
          </li>
          <li>
            <strong>Errors:</strong> <code>{`{ "error": { "code", "message" } }`}</code>.
          </li>
        </ul>
      </Card>

      <SectionTitle>Endpoints</SectionTitle>
      <div className="space-y-2">
        {ENDPOINTS.map((e) => (
          <Card key={e.path} className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-xs text-emerald-300">
                {e.method}
              </span>
              <span className="font-mono text-sm text-white">{e.path}</span>
            </div>
            <div className="text-sm text-slate-400">{e.desc}</div>
            <a className="font-mono text-xs" href={e.example}>
              {e.example}
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}
