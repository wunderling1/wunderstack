/**
 * CAO retrieval wrapper — thin: delegates to the shared grounded helper.
 * Corpus key comes from the input (`profile.agentKey` via the pipeline), never a literal here.
 */

export {
  retrievalInputSchema,
  retrievalHitSchema,
  retrievalMetaSchema,
  runGroundedRetrieval as runRetrieval,
  type RetrievalInput,
  type RetrievalMeta,
  type RetrievalOutput,
} from "../runtime/retrieval";
