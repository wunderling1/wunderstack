import type {
  RoleplayMessage,
  RoleplayScenarioPrompt,
  RoleplayTurnResult,
} from "@wunderstack/agents";
import type { RoleplayEndReason, RoleplayEvent } from "@wunderstack/shared";

/**
 * One roleplay turn as a sequence of NDJSON events.
 *
 * Kept out of the route handler and given its dependencies as functions so the ordering rules below
 * can be tested without a database, a model, or an HTTP server. The route supplies the real store
 * and agent; a test supplies stubs.
 *
 * The turn has already been claimed by the time this runs. Claiming is an atomic UPDATE that can
 * refuse (session finished, budget spent), and a refusal deserves an HTTP status rather than a 200
 * carrying an error event — so the route does that before opening the stream. What arrives here is
 * a turn that was granted.
 */

export interface RoleplayTurnDeps {
  /** The learner's line. */
  message: string;
  /** The frozen scenario this session runs on — never the live scenario row. */
  scenario: RoleplayScenarioPrompt;
  /** Authoritative counter state from `claim_roleplay_turn`. */
  turnsUsed: number;
  maxTurns: number;
  loadTranscript: () => Promise<RoleplayMessage[]>;
  nextTurn: (input: {
    history: RoleplayMessage[];
    isClosingTurn: boolean;
  }) => Promise<RoleplayTurnResult>;
  /**
   * Store both messages and, when the conversation is over, close the session. One call so the route
   * decides how to make it atomic; `endReason` is null while the conversation continues.
   */
  persist: (args: {
    userMessage: string;
    assistantMessage: string;
    endReason: RoleplayEndReason | null;
  }) => Promise<void>;
  traceId?: string | null;
}

export async function* roleplayTurnEvents(deps: RoleplayTurnDeps): AsyncGenerator<RoleplayEvent> {
  yield { type: "status", phase: "generating" };

  // The claim already incremented the counter, so `turnsUsed === maxTurns` means this granted turn
  // is the last one the budget allows. The persona is told to wrap up rather than ask another
  // question, otherwise a session that hits its ceiling simply stops mid-exchange.
  const isClosingTurn = deps.turnsUsed >= deps.maxTurns;

  const history = await deps.loadTranscript();
  const result = await deps.nextTurn({ history, isClosingTurn });

  const endReason: RoleplayEndReason | null = !result.conversationEnd
    ? null
    : isClosingTurn
      ? "max_turns_reached"
      : "completed";

  // Persist before emitting. A reply the learner can see but that was never stored would vanish on
  // reload and would be missing from the transcript the reviewer scores.
  await deps.persist({
    userMessage: deps.message,
    assistantMessage: result.text,
    endReason,
  });

  yield { type: "text", delta: result.text };
  yield {
    type: "turn",
    reply: result.text,
    conversationEnd: result.conversationEnd,
    turnsUsed: deps.turnsUsed,
    maxTurns: deps.maxTurns,
    endReason,
  };
  yield { type: "done", usage: result.usage, traceId: deps.traceId ?? null };
}
