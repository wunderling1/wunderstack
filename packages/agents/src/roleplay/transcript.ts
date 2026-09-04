import type { RoleplayMessage } from "./types";

/**
 * How the transcript reaches the model.
 *
 * Two callers, two windows, and the difference matters. A conversation turn only needs recent
 * context, so it gets the last N messages. A review must see the WHOLE conversation: score the last
 * thirty messages of a long session and the opening falls outside the window, which is precisely
 * where most rubric criteria are decided. Qonvo learned this the hard way — its review path passes
 * `windowSize: "all"` with a comment saying exactly that.
 *
 * Keeping both formatters here means the window rule lives in one file instead of being re-decided
 * at each call site.
 */

/** Recent-context window for a conversation turn. Mirrors Qonvo's n8n `memoryBufferWindow`. */
export const CONVERSATION_HISTORY_WINDOW = 30;

/** Last N messages, oldest first. Used for a turn — never for a review. */
export function windowHistory(
  messages: RoleplayMessage[],
  windowSize: number = CONVERSATION_HISTORY_WINDOW,
): RoleplayMessage[] {
  if (windowSize <= 0 || messages.length <= windowSize) {
    return [...messages];
  }
  return messages.slice(-windowSize);
}

/**
 * Prior turns as prose for the conversation prompt. The learner's lines are quoted and labelled with
 * `userTitle`, the persona's are plain — the same asymmetry as the live turn message, so the model
 * sees one consistent format rather than two.
 */
export function formatHistoryForPrompt(
  messages: RoleplayMessage[],
  userTitle: string,
  partnerRole: string,
): string {
  if (messages.length === 0) {
    return "";
  }
  return messages
    .map((message) =>
      message.role === "user"
        ? `${userTitle}: "${message.content}"`
        : `${partnerRole}: ${message.content}`,
    )
    .join("\n\n");
}

/**
 * The full transcript as JSON for the reviewer.
 *
 * `human`/`ai` rather than `user`/`assistant`: this is the shape the review prompt describes and the
 * one Qonvo's tuned reviewer was calibrated against. Renaming the keys is a prompt change, so it
 * would need a `ROLEPLAY_PROMPT_VERSION` bump, not a tidy-up.
 */
export function formatTranscriptForReview(
  messages: RoleplayMessage[],
  userTitle: string,
): string {
  if (messages.length === 0) {
    return "[]";
  }
  return JSON.stringify(
    messages.map((message) => ({
      type: message.role === "user" ? "human" : "ai",
      content:
        message.role === "user" ? `${userTitle}: "${message.content}"` : message.content,
    })),
  );
}
