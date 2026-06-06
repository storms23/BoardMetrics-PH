import { NextResponse } from "next/server";

/** Machine-readable OpenAPI 3.0 description of the public API. */
export function GET() {
  const spec = {
    openapi: "3.0.3",
    info: {
      title: "Pasa Rate PH API",
      version: "1.0.0",
      description:
        "Public REST API for PRC board-exam results: schools, exams, rankings, topnotchers, search, and analytics. Rate-limited per IP; pass X-API-Key for the partner tier.",
    },
    servers: [{ url: "/api/v1" }],
    paths: {
      "/exams": { get: { summary: "List programs with summary stats" } },
      "/exams/{code}": {
        get: {
          summary: "Exam history",
          parameters: [
            { name: "code", in: "path", required: true, schema: { type: "string" } },
            { name: "year", in: "query", schema: { type: "integer" } },
            { name: "month", in: "query", schema: { type: "string" } },
          ],
        },
      },
      "/exams/{code}/top-schools": {
        get: { summary: "Top schools for an exam cycle" },
      },
      "/schools": {
        get: {
          summary: "Search/list schools",
          parameters: [
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "region", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "per_page", in: "query", schema: { type: "integer" } },
          ],
        },
      },
      "/schools/{id}": { get: { summary: "School profile + consistency + history" } },
      "/schools/{id}/topnotchers": { get: { summary: "Topnotchers from a school" } },
      "/rankings": {
        get: {
          summary: "School rankings",
          parameters: [
            { name: "exam_code", in: "query", required: true, schema: { type: "string" } },
            { name: "year", in: "query", schema: { type: "integer" } },
            { name: "region", in: "query", schema: { type: "string" } },
            { name: "min_takers", in: "query", schema: { type: "integer" } },
          ],
        },
      },
      "/topnotchers": { get: { summary: "List topnotchers" } },
      "/search": {
        get: {
          summary: "Global search",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string", minLength: 2 } },
          ],
        },
      },
      "/compare": {
        get: {
          summary: "Compare schools",
          parameters: [
            { name: "school_ids", in: "query", required: true, schema: { type: "string" } },
          ],
        },
      },
      "/regions": { get: { summary: "Regional analytics" } },
      "/analytics/trend": { get: { summary: "School pass-rate trend" } },
      "/analytics/difficulty": { get: { summary: "Exam difficulty over time" } },
      "/analytics/distribution": { get: { summary: "Pass-rate distribution bands" } },
      "/export": {
        get: {
          summary: "Export CSV/Excel",
          parameters: [
            { name: "type", in: "query", schema: { type: "string" } },
            { name: "format", in: "query", schema: { type: "string", enum: ["csv", "xlsx"] } },
          ],
        },
      },
    },
  };
  return NextResponse.json(spec);
}
