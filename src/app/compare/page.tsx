import { CompareTool } from "@/components/CompareTool";

export const metadata = { title: "Compare Schools" };

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids = "" } = await searchParams;
  const initialIds = ids
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-white">Compare schools</h1>
      <CompareTool initialIds={initialIds} />
    </div>
  );
}
