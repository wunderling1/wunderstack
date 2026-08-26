/**
 * Inbound webhook contract. The Zod schemas live in `@wunderstack/shared` so inbound and outbound
 * share one event vocabulary (`ping`, `cao.updated`, `roleplay.result`). This file is the route's
 * local name for them.
 */
export {
  webhookAckSchema,
  webhookEventSchema,
  webhookEventRequiresFund,
  type WebhookAck,
  type WebhookEvent,
} from "@wunderstack/shared";
