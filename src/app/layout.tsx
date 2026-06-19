import type { Metadata } from "next";
import Link from "next/link";
import { HeaderSearch } from "@/components/HeaderSearch";
import { SiteLogo } from "@/components/SiteLogo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — PRC Board Exam Results, Searchable`,
    template: `%s · ${SITE_NAME}`,
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
          <div className="mx-auto max-w-6xl px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link href="/" className="flex items-center gap-2 text-slate-900 no-underline">
                <SiteLogo />
                <span className="text-lg font-extrabold tracking-tight leading-tight">
                  Board Analytics{" "}
                  <span className="text-brand">PH</span>
                </span>
              </Link>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <HeaderSearch />
                <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <Link href="/exams">Exams</Link>
                  <Link href="/compare">Compare exams</Link>
                  <Link
                    href="/support"
                    className="no-underline-link rounded-lg border border-brand bg-brand/5 px-3 py-1.5 font-semibold text-brand hover:bg-brand hover:text-white"
                  >
                    Support creator
                  </Link>
                </nav>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="border-t border-ink-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-600">
            {SITE_NAME} presents publicly available PRC data for research and information. It
            is an unofficial, independent project and is not affiliated with the Professional
            Regulation Commission.
          </div>
        </footer>
      </body>
    </html>
  );
}
