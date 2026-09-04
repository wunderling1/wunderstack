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
  windowSince: Date;
  knowledgeGaps: QuestionSignal[];
  knowledgeGapsTotal: number;
  previousKnowledgeGapsTotal: number;
  knowledgeGapsGroupTotal: number;
  topKnowledgeGaps: QuestionSignal[];
  questionsAsked: number;
  questionsAnswered: number;
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

  const signals = await listSignals({
    fundKey,
    since: window.since,
    until: window.until,
    agentKey: filters.agentId,
    includeSuspicious: options.includeSuspicious,
    page: filters.page,
    now,
  });

  return {
    filters,
    agents,
    measurementStartedAt: signals.measurementStartedAt,
    windowSince: window.since,
    knowledgeGaps: signals.knowledgeGaps,
    knowledgeGapsTotal: signals.knowledgeGapsTotal,
    previousKnowledgeGapsTotal: signals.previousKnowledgeGapsTotal,
    knowledgeGapsGroupTotal: signals.knowledgeGapsGroupTotal,
    topKnowledgeGaps: signals.topKnowledgeGaps,
    questionsAsked: signals.questionsAsked,
    questionsAnswered: signals.questionsAnswered,
    suspiciousRefusals: options.includeSuspicious ? signals.suspiciousRefusals : [],
    exerciseAdoption: signals.exerciseAdoption,
  };
}
