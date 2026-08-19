/**
 * The chat API contract, shared by the route handler (server) and the chat client.
 * Canonical schemas live in `@wunderstack/shared` (see .cursor/rules/300-typescript.mdc).
 */

export {
  chatHistoryMessageSchema,
  chatRequestSchema,
  chatStatusPhases,
  chatEventSchema,
  type ChatRequest,
  type ChatCitation,
  type ChatStatusPhase,
  type ChatEvent,
} from "@wunderstack/shared";
