/** Responsive chart height — shorter on phones, full height on sm+. */
export function ChartFrame({ children }: { children: React.ReactNode }) {
  return <div className="h-[260px] w-full min-w-0 sm:h-[360px]">{children}</div>;
}
