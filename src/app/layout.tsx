import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Pasa Rate PH — PRC Board Exam Results, Searchable",
    template: "%s · Pasa Rate PH",
  },
  description:
    "Search, compare, and analyze PRC licensure examination results by school, exam, year, and region.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-ink-line bg-ink-soft">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-white">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm">
                PR
              </span>
              <span className="text-lg font-extrabold tracking-tight">
                Pasa Rate <span className="text-brand-light">PH</span>
              </span>
            </Link>
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <Link href="/search">Search</Link>
              <Link href="/exams">Exams</Link>
              <Link href="/rankings">Rankings</Link>
              <Link href="/leaderboard">Leaderboard</Link>
              <Link href="/regions">Regions</Link>
              <Link href="/compare">Compare</Link>
              <Link href="/api-docs">API</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="border-t border-ink-line bg-ink-soft">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500">
            Pasa Rate PH presents publicly available PRC data for research and
            information. It is an unofficial, independent project and is not
            affiliated with the Professional Regulation Commission.
          </div>
        </footer>
      </body>
    </html>
  );
}
