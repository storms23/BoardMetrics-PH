import type { Metadata } from "next";
import Link from "next/link";
import { HeaderSearch } from "@/components/HeaderSearch";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Pasa Rate PH — PRC Board Exam Results, Searchable",
    template: "%s · Pasa Rate PH",
  },
  description:
    "Track national PRC licensure exam pass rates — search by exam, compare programs, and explore year-over-year trends.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-ink-line bg-white shadow-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-slate-900 no-underline">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
                PR
              </span>
              <span className="text-lg font-extrabold tracking-tight">
                Pasa Rate <span className="text-brand">PH</span>
              </span>
            </Link>
            <div className="flex flex-wrap items-center gap-4">
              <HeaderSearch />
              <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                <Link href="/search">Search</Link>
                <Link href="/exams">Exams</Link>
                <Link href="/compare">Compare exams</Link>
                <Link href="/api-docs">API</Link>
              </nav>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="border-t border-ink-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-600">
            Pasa Rate PH presents publicly available PRC data for research and
            information. It is an unofficial, independent project and is not
            affiliated with the Professional Regulation Commission.
          </div>
        </footer>
      </body>
    </html>
  );
}
