import { Card, SectionTitle, EmptyState } from "@/components/ui";
import { isAdmin } from "@/lib/adminAuth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { listImportJobs, listAuditLogs, runVerification } from "@/lib/admin";
import { login, logout } from "./actions";

export const metadata = { title: "Admin Console" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!process.env.ADMIN_PASSWORD) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-white">Admin console</h1>
        <EmptyState
          title="Admin is not configured."
          hint="Set ADMIN_PASSWORD in .env.local to enable the admin console."
        />
      </div>
    );
  }

  if (!(await isAdmin())) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <h1 className="text-2xl font-extrabold text-white">Admin login</h1>
        <Card>
          <form action={login} className="space-y-3">
            <input
              type="password"
              name="password"
              placeholder="Admin password"
              className="w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-white"
              autoFocus
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
            >
              Sign in
            </button>
          </form>
        </Card>
      </div>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-white">Admin console</h1>
        <EmptyState title="Connect Supabase to view import jobs, audit logs, and verification." />
      </div>
    );
  }

  let jobs: any[] = [];
  let logs: any[] = [];
  let report: Awaited<ReturnType<typeof runVerification>> | null = null;
  try {
    [jobs, logs, report] = await Promise.all([
      listImportJobs(),
      listAuditLogs(),
      runVerification(),
    ]);
  } catch (e) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-white">Admin console</h1>
        <EmptyState title="Could not load admin data." hint={(e as Error).message} />
      </div>
    );
  }

  const allChecks = report
    ? [...report.duplicates, ...report.missing, ...report.validation]
    : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-white">Admin console</h1>
        <form action={logout}>
          <button className="rounded-lg border border-ink-line px-3 py-1.5 text-sm text-slate-300 hover:border-brand">
            Sign out
          </button>
        </form>
      </div>

      <section>
        <SectionTitle>Data import</SectionTitle>
        <Card className="text-sm text-slate-300">
          Imports run via the Python ETL pipeline (see <code>scraper/</code>). Trigger a run with{" "}
          <code className="text-brand-light">python scraper.py --all 2025</code>, then recompute
          scores with <code className="text-brand-light">python consistency.py</code>. Each run is
          recorded below.
        </Card>
      </section>

      <section>
        <SectionTitle>Data verification</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {allChecks.map((c) => (
            <Card key={c.type}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">{c.type}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    c.count === 0
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-rose-500/15 text-rose-300"
                  }`}
                >
                  {c.count}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{c.detail}</div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Import jobs</SectionTitle>
        {jobs.length === 0 ? (
          <Card>No import jobs yet.</Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-ink-line text-left text-slate-400">
                <tr>
                  <th className="p-3">Program</th>
                  <th className="p-3">Year</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Rows</th>
                  <th className="p-3">Started</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b border-ink-line/50">
                    <td className="p-3">{j.programs?.exam_code ?? "—"}</td>
                    <td className="p-3">{j.year}</td>
                    <td className="p-3">{j.status}</td>
                    <td className="p-3 text-right">{j.rows_affected}</td>
                    <td className="p-3 text-slate-400">
                      {new Date(j.started_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>Audit log</SectionTitle>
        {logs.length === 0 ? (
          <Card>No audit entries yet.</Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-ink-line text-left text-slate-400">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Actor</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Entity</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-ink-line/50">
                    <td className="p-3 text-slate-400">
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td className="p-3">{l.actor ?? "—"}</td>
                    <td className="p-3">{l.action}</td>
                    <td className="p-3">
                      {l.entity}
                      {l.entity_id ? ` #${l.entity_id}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
