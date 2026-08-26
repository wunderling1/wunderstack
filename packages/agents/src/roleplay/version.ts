/**
 * Prompt build identity for the roleplay agent.
 *
 * Stored on every session and every review (`prompt_version`), so a finished conversation can be
 * traced back to the exact instructions it ran on (EU AI Act Art. 12). Bump on ANY change to
 * `prompts.ts`, `schemas.ts` or the model settings below — a prompt edit that keeps the old version
 * string makes older records claim a text they never saw.
 *
 * Qonvo's lineage: its `MASTRA_WORKFLOW_VERSION` was `2026-06-26-dutch-grammar`, itself descended
 * from the n8n `2026-05-15-voice` workflow. This is a fresh line because the port drops the voice
 * block and the didactic sections (see prompts.ts).
 *
 * - `2026-08-25-port` — the port itself.
 * - `2026-08-25-review-retry` — a corrective turn after a review that would not parse. Counts as a
 *   prompt change because the model can see it, even though only the failure path renders it.
 */
export const ROLEPLAY_PROMPT_VERSION = "2026-08-25-review-retry";

/** The three model calls a roleplay session makes. Surfaced as a Langfuse span name and tag. */
export type RoleplayBranch = "opening" | "turn" | "review";

/**
 * Model settings per branch. Qonvo set none and inherited whatever the provider defaulted to, which
 * makes generation quality depend on a number we do not control and cannot see in a trace.
 *
 * The two branches want opposite things. A roleplay partner at temperature 0 is a robot that repeats
 * the same sentence when the learner rephrases; a reviewer at 0.7 hands out different grades for the
 * same transcript, and that grade goes to a customer's LMS. So: warm partner, cold judge.
 *
 * Token ceilings match the shape of each output. A turn is two to four sentences; a review carries a
 * summary plus one feedback block per criterion, which does not fit in the 1024-token library
 * default (`DEFAULT_MAX_OUTPUT_TOKENS`) — a truncated review is an invalid review.
 */
export interface RoleplayModelSettings {
  temperature: number;
  maxOutputTokens: number;
}

export const ROLEPLAY_MODEL_SETTINGS: Record<RoleplayBranch, RoleplayModelSettings> = {
  opening: { temperature: 0.7, maxOutputTokens: 600 },
  turn: { temperature: 0.7, maxOutputTokens: 600 },
  review: { temperature: 0.2, maxOutputTokens: 4000 },
};

/** Wall-clock ceiling per branch. A review reasons over the whole transcript and is genuinely slow. */
export const ROLEPLAY_TIMEOUT_MS: Record<RoleplayBranch, number> = {
  opening: 30_000,
  turn: 30_000,
  review: 120_000,
};
