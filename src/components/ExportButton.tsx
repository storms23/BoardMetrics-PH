"use client";

export function ExportButton({ query }: { query: string }) {
  return (
    <div className="flex gap-2">
      <a
        href={`/api/v1/export?${query}&format=csv`}
        className="rounded-lg border border-ink-line bg-ink-soft px-3 py-2 text-sm font-semibold hover:border-brand"
      >
        Export CSV
      </a>
      <a
        href={`/api/v1/export?${query}&format=xlsx`}
        className="rounded-lg border border-ink-line bg-ink-soft px-3 py-2 text-sm font-semibold hover:border-brand"
      >
        Export Excel
      </a>
    </div>
  );
}
