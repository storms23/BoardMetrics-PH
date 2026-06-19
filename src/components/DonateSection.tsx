import Image from "next/image";
import donateQr from "@/app/image/donate-qr.png";
import { SITE_NAME } from "@/lib/site";
import { Card } from "@/components/ui";

export function DonateSection({ embedded = false }: { embedded?: boolean }) {
  const inner = (
    <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        {!embedded && (
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
            Support the creator
          </h2>
        )}
        <p className="text-sm leading-relaxed text-slate-600">
          {SITE_NAME} is built and maintained independently. If this site helped your board exam
          research or review, you can send a tip via InstaPay by scanning the QR code.
        </p>
        <p className="text-xs text-slate-500">Donations are optional and deeply appreciated.</p>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-2 self-center sm:self-auto">
        <div className="rounded-lg bg-white p-1">
          <Image
            src={donateQr}
            alt="InstaPay donation QR code"
            className="h-44 w-44 max-w-full bg-white object-contain sm:h-48 sm:w-48"
            unoptimized
          />
        </div>
        <p className="text-xs font-medium text-slate-600">Scan to donate · InstaPay</p>
      </div>
    </div>
  );

  if (embedded) {
    return <Card>{inner}</Card>;
  }

  return (
    <section className="border-t border-ink-line bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8">{inner}</div>
    </section>
  );
}
