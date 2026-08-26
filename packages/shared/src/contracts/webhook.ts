import { z } from "zod";

/**
 * Event vocabulary shared by the inbound webhook (`POST /api/webhook`) and the outbound result
 * delivery (Fase 7). One enum so a payload we send is a payload the inbound seam can acknowledge,
 * and so adding a type is a schema change rather than a silent string in two places.
 *
 * Inbound still has no side effects: a well-typed, signed envelope is acknowledged with 202.
 * Outbound `roleplay.result` is the first event we ourselves produce.
 */
export const WEBHOOK_EVENT_TYPES = ["ping", "cao.updated", "roleplay.result"] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const webhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES);

/**
 * Inbound envelope. `data` stays opaque here: the inbound seam does not act on it, and the outbound
 * `roleplay.result` body is a *narrowing* of this shape (see roleplay-result.ts), not a sibling.
 */
export const webhookEventSchema = z
  .object({
    type: webhookEventTypeSchema,
    /** O&O fund key this event concerns. Required for everything except pings. */
    fund: z.string().min(1).max(200).optional(),
    occurredAt: z.iso.datetime().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export const webhookAckSchema = z
  .object({
    received: z.literal(true),
    type: webhookEventTypeSchema,
  })
  .strict();

export type WebhookAck = z.infer<typeof webhookAckSchema>;

/** Events that name a fund. A ping may omit it; everything else is about a specific corpus or session. */
export function webhookEventRequiresFund(type: WebhookEventType): boolean {
  return type !== "ping";
}
