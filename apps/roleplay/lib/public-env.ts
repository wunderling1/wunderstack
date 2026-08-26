import { z } from "zod";

/**
 * Client-safe parse of public Next env. Do not import `@wunderstack/shared` env here — that barrel
 * parses the whole process env at import.
 */

const DEFAULT_INACTIVITY_MS = 20_000;
const inactivityMsSchema = z.coerce.number().int().positive().max(300_000);

export function readRoleplayInactivityMs(): number {
  const raw = process.env.NEXT_PUBLIC_ROLEPLAY_INACTIVITY_MS?.trim();
  if (!raw) {
    return DEFAULT_INACTIVITY_MS;
  }
  const parsed = inactivityMsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_INACTIVITY_MS;
}

/** How often the client asks whether a review is ready. */
export const REVIEW_POLL_MS = 3_000;

/** Give up polling after this: the review itself is allowed two minutes, plus margin. */
export const REVIEW_POLL_BUDGET_MS = 150_000;
