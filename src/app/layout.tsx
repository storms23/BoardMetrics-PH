import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { HeaderSearch } from "@/components/HeaderSearch";
import { SiteLogo } from "@/components/SiteLogo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

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
              <Link
                href="/"
                className="flex shrink-0 items-center gap-2 text-slate-900 no-underline"
              >
                <SiteLogo />
                <span className="text-lg font-extrabold leading-tight tracking-tight">
                  Board Analytics{" "}
                  <span className="text-brand">PH</span>
                </span>
              </Link>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <HeaderSearch />
                <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <Link href="/exams" className="whitespace-nowrap">
                    Exams
                  </Link>
                  <Link href="/compare" className="whitespace-nowrap">
                    Compare exams
                  </Link>
                  <Link
                    href="/support"
                    className="no-underline-link whitespace-nowrap rounded-lg border border-brand bg-brand/5 px-3 py-1.5 font-semibold text-brand hover:bg-brand hover:text-white"
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
            <p>
              Disclaimer: This website is provided for informational purposes only. Although we
              strive for accuracy, information may contain errors, omissions, or become outdated.
              Please verify important details with official sources before relying on the data.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
