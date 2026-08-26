// Roleplay sub-barrel. Kept separate from the grounded seam so the two are readable independently
// (DECISION-roleplay-agent.md, R6): this agent retrieves nothing, cites nothing, and shares only the
// model adapter and the Langfuse wiring with `runtime/`.

export { createRoleplayAgent, type CreateRoleplayAgentOptions } from "./agent.js";

export {
  buildOpeningSystemPrompt,
  buildOpeningUserMessage,
  buildTurnSystemPrompt,
  buildTurnUserMessage,
  buildReviewSystemPrompt,
  buildReviewUserMessage,
} from "./prompts.js";

export {
  normalizeRubricWeights,
  resolveRubric,
  computeWeightedScore,
  didPass,
} from "./rubric.js";

export {
  extractJsonObject,
  normalizeReviewOutput,
  toScore,
  roleplayOpeningOutputSchema,
  roleplayTurnOutputSchema,
  roleplayReviewOutputSchema,
  type RoleplayOpeningOutput,
  type RoleplayTurnOutput,
  type RoleplayReviewOutput,
} from "./schemas.js";

export {
  CONVERSATION_HISTORY_WINDOW,
  formatHistoryForPrompt,
  formatTranscriptForReview,
  windowHistory,
} from "./transcript.js";

export {
  ROLEPLAY_PROMPT_VERSION,
  ROLEPLAY_MODEL_SETTINGS,
  ROLEPLAY_TIMEOUT_MS,
  type RoleplayBranch,
  type RoleplayModelSettings,
} from "./version.js";

export { resetRoleplayModelCache } from "./model-call.js";

export {
  parseScenarioSnapshot,
  roleplayScenarioPromptSchema,
  roleplayScenarioSnapshotSchema,
  type RoleplayScenarioSnapshot,
  type RoleplayScenarioDisplay,
} from "./snapshot.js";

// Persistence. Separate from the agent seam above: apps may not reach the fund schema themselves
// (`no-apps-to-fund-schema`), so the routes come through here.
export {
  resolvePublishedScenario,
  startSession,
  loadSession,
  loadTranscript,
  claimTurn,
  appendTurn,
  appendTurnAndMaybeEnd,
  nextMessageOrdinals,
  endSession,
  loadReview,
  saveReview,
  claimReview,
  clearReviewClaim,
  type ResolvedScenario,
  type RoleplaySessionRecord,
  type StartSessionInput,
  type ClaimTurnResult,
  type StoredReview,
} from "./session-store.js";

export {
  enqueueResultDelivery,
  claimDueDeliveries,
  markDeliveryDelivered,
  markDeliveryFailed,
  ROLEPLAY_DELIVERY_MAX_ATTEMPTS,
  nextDeliveryAttemptAt,
  type ClaimedDelivery,
} from "./delivery-store.js";

export type {
  RoleplayAgent,
  RoleplayCallOptions,
  RoleplayMessage,
  RoleplayModelCall,
  RoleplayOpeningInput,
  RoleplayOpeningResult,
  RoleplayReviewInput,
  RoleplayReviewResult,
  RoleplayScenarioPrompt,
  RoleplayTurnInput,
  RoleplayTurnResult,
  ResolvedRubric,
  ScoredCriterion,
  WeightedCriterion,
} from "./types.js";
