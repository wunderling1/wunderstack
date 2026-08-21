import { z } from "zod";

/**
 * Client-safe parse of public Next env. Do not import `@wunderstack/shared` env here — that barrel
 * parses the whole process env at import. Bounds mirror `RUNTIME_CHAT_*` (positive, max 5 minutes).
 */

const DEFAULT_CHAT_INACTIVITY_MS = 20_000;

const inactivityMsSchema = z.coerce.number().int().positive().max(300_000);

export function readChatInactivityMs(): number {
  const raw = process.env.NEXT_PUBLIC_CHAT_INACTIVITY_MS?.trim();
  if (!raw) {
    return DEFAULT_CHAT_INACTIVITY_MS;
  }
  const parsed = inactivityMsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_CHAT_INACTIVITY_MS;
}
