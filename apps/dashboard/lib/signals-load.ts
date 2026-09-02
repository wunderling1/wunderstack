import {
  listSignals,
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
  knowledgeGapsTotal: number;
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

  // One transaction. The gap total and the measurement start used to be two more reads; both come
  // out of the ranking `listSignals` already builds, so asking for them separately was the same
  // query twice plus a BEGIN/COMMIT each.
  const signals = await listSignals({
    fundKey,
    since: window.since,
    until: window.until,
    agentId: filters.agentId,
    includeSuspicious: options.includeSuspicious,
    now,
  });

  return {
    filters,
    agents,
    measurementStartedAt: signals.measurementStartedAt,
    knowledgeGaps: signals.knowledgeGaps,
    knowledgeGapsTotal: signals.knowledgeGapsTotal,
    suspiciousRefusals: options.includeSuspicious ? signals.suspiciousRefusals : [],
    exerciseAdoption: signals.exerciseAdoption,
  };
}
