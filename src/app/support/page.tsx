import { CreatorFeedbackForm } from "@/components/CreatorFeedbackForm";
import { DonateSection } from "@/components/DonateSection";

export const metadata = { title: "Support the creator" };

export default function SupportPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Support the creator</h1>
        <p className="mt-1 text-sm text-slate-600">
          Help keep Board Analytics PH free and maintained for board exam researchers and
          students.
        </p>
      </div>
      <DonateSection embedded />
      <CreatorFeedbackForm />
    </div>
  );
}
