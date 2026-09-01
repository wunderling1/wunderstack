import { Button, Select } from "@wunderstack/ui";
import { PeriodPicker } from "@/components/fund/period-picker";
import {
  conversationFilterExtras,
  FILTER_OUTCOMES,
  FILTER_REASONS,
  OUTCOME_LABELS,
  REASON_LABELS,
  type ConversationFilters,
} from "@/lib/conversations";
import { agentLabel } from "@/lib/release-manifest";

export function ConversationFiltersForm({
  pathname,
  filters,
  agents,
}: {
  pathname: string;
  filters: ConversationFilters;
  agents: readonly string[];
}) {
  const extras = conversationFilterExtras(filters);

  return (
    <div className="flex flex-col gap-4">
      <PeriodPicker pathname={pathname} period={filters.period} extras={extras} />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="period" value={filters.period} />
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="text-text-muted">Agent</span>
          <Select name="agent" defaultValue={filters.agentId ?? ""}>
            <option value="">Alle agents</option>
            {agents.map((agentId) => (
              <option key={agentId} value={agentId}>
                {agentLabel(agentId)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="text-text-muted">Uitkomst</span>
          <Select name="outcome" defaultValue={filters.outcome ?? ""}>
            <option value="">Alle uitkomsten</option>
            {FILTER_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {OUTCOME_LABELS[outcome]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="text-text-muted">Reden</span>
          <Select name="reason" defaultValue={filters.reason ?? ""}>
            <option value="">Alle redenen</option>
            {FILTER_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {REASON_LABELS[reason]}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
    </div>
  );
}
