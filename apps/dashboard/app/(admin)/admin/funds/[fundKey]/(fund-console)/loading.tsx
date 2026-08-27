import { PanelSkeleton } from "@/components/fund/panel-skeleton";

export default function FundConsoleLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Laden…</span>
      <PanelSkeleton />
    </div>
  );
}
