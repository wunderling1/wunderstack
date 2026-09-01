import {
  listSignals,
  measurementStartedAt,
  type ExerciseAdoptionRow,
  type QuestionSignal,
} from "@wunderstack/analytics";
import { listInstancesCached } from "@/lib/fund-lookups";
import { currentWindow } from "@/lib/period";
import { parseSignalsFilters, type SignalsFilters, type SignalsSearchParams } from "@/lib/signals";

export interface SignalsModel {
  filters: SignalsFilters;
  agents: string[];
  measurementStartedAt: Date | null;
  knowledgeGaps: QuestionSignal[];
  suspiciousRefusals: QuestionSignal[];
  exerciseAdoption: ExerciseAdoptionRow[];
}

export async function loadSignalsModel(
  fundKey: string,
  search: SignalsSearchParams,
  options: { includeSuspicious: boolean },
  now = new Date(),
): Promise<SignalsModel> {
  const instances = await listInstancesCached(fundKey);
  const agents = instances.map((instance) => instance.agentKey);
  const filters = parseSignalsFilters(search, agents);
  const window = currentWindow(filters.period, now);

  const [signals, startedAt] = await Promise.all([
    listSignals({
      fundKey,
      since: window.since,
      until: window.until,
      agentId: filters.agentId,
      includeSuspicious: options.includeSuspicious,
      now,
    }),
    measurementStartedAt(fundKey),
  ]);

  return {
    filters,
    agents,
    measurementStartedAt: startedAt,
    knowledgeGaps: signals.knowledgeGaps,
    suspiciousRefusals: options.includeSuspicious ? signals.suspiciousRefusals : [],
    exerciseAdoption: signals.exerciseAdoption,
  };
}
