import { ARBO_QUERY_EXPANSIONS, rewriteArboQuery } from "./rewrite";
import {
  runGroundedRetrieval,
  type RetrievalInput,
  type RetrievalOutput,
} from "../runtime/retrieval";

export {
  retrievalInputSchema,
  retrievalHitSchema,
  retrievalMetaSchema,
  type RetrievalInput,
  type RetrievalMeta,
  type RetrievalOutput,
} from "../runtime/retrieval";

/**
 * Arbo retrieval: rewrite + expansions, then the shared grounded helper.
 * `agentKey` still comes from the input (pipeline → profile.agentKey).
 */
export async function runRetrieval(input: RetrievalInput): Promise<RetrievalOutput> {
  const primary = rewriteArboQuery(input.query);
  return runGroundedRetrieval(
    { ...input, query: primary.rewritten },
    { queryExpansions: ARBO_QUERY_EXPANSIONS },
  );
}
