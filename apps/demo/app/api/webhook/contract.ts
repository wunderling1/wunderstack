import { z } from "zod";

/**
 * Inbound webhook contract for LMS / O&O-fund systems. v1 accepts a minimal, well-typed envelope
 * and acknowledges it; it deliberately does not trigger ingestion or any side effect yet (that
 * arrives when a real fund integration forces it — see PLAN.md "Buiten v1"). The point now is a
 * validated, documented seam.
 */
export const webhookEventSchema = z.object({
  /** Event kind the fund/LMS is notifying us about. */
  type: z.enum(["cao.updated", "ping"]),
  /** O&O fund key this event concerns (control/data-plane key). Required except for pings. */
  fund: z.string().min(1).max(200).optional(),
  /** ISO timestamp the sender generated the event. */
  occurredAt: z.iso.datetime().optional(),
  /** Free-form sender payload; kept opaque in v1. */
  data: z.record(z.string(), z.unknown()).optional(),
});

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export const webhookAckSchema = z.object({
  received: z.literal(true),
  type: webhookEventSchema.shape.type,
});

export type WebhookAck = z.infer<typeof webhookAckSchema>;
