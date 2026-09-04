/**
 * Playground-local re-export of the shared chat contract so client components can import
 * `@/app/api/chat/contract` without reaching into the runtime app (arrow rule).
 */

export {
  chatHistoryMessageSchema,
  chatRequestSchema,
  chatStatusPhases,
  chatEventSchema,
  errored,
  type ChatRequest,
  type ChatCitation,
  type ChatStatusPhase,
  type ChatEvent,
  type WritableTurnOutcome,
} from "@wunderstack/shared/browser";
