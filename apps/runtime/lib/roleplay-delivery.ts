import { lookup as dnsLookup } from "node:dns/promises";
import {
  claimDueDeliveries,
  enqueueResultDelivery,
  markDeliveryDelivered,
  markDeliveryFailed,
  ROLEPLAY_DELIVERY_MAX_ATTEMPTS,
  type ClaimedDelivery,
} from "@wunderstack/agents";
import { env, type RoleplayResultEnvelope } from "@wunderstack/shared";

import { assertSafeDeliveryUrl, type DnsLookup } from "./safe-delivery-url.js";
import { webhookSignatureHeaders } from "./webhook-sign.js";
import { deliverLti11Outcome } from "./lti11/outcomes.js";

/**
 * Outbox processor: take due rows, POST them through the matching adapter, record the outcome.
 *
 * Fail-silent in the Qonvo sense (`triggerLti11Passback`): a delivery that errors must not throw
 * back into `runReview`. The review is already stored; the outbox retries. Adapters are keyed on
 * `target.kind` so LTI 1.1 Basic Outcomes (`lti11`) shares the same outbox as webhook. LTI 1.3 is
 * a later adapter, not a second table.
 *
 * `fetch` and `lookup` are injectable so the adapter can be unit-tested without a network.
 */

const DELIVERY_TIMEOUT_MS = 10_000;

export type DeliveryFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    redirect: "error";
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; text?: () => Promise<string> }>;

export interface DeliveryDeps {
  fetch: DeliveryFetch;
  lookup: DnsLookup;
  secret: string | undefined;
  now: () => Date;
}

const productionDeps = (): DeliveryDeps => ({
  fetch: globalThis.fetch as DeliveryFetch,
  lookup: (hostname) => dnsLookup(hostname, { all: true }),
  secret: env.WEBHOOK_SIGNING_SECRET,
  now: () => new Date(),
});

export async function enqueueAndProcessDeliveries(fund: string, sessionId: string): Promise<void> {
  await enqueueResultDelivery(fund, sessionId);
  await processDueDeliveries(fund);
}

/**
 * Drain due outbox rows for this fund. Safe to call from any `after()` — empty when nothing is due.
 */
export async function processDueDeliveries(
  fund: string,
  deps: DeliveryDeps = productionDeps(),
): Promise<void> {
  let claimed: ClaimedDelivery[];
  try {
    claimed = await claimDueDeliveries(fund, deps.now());
  } catch (error) {
    console.error("[roleplay-delivery] claim failed:", error);
    return;
  }

  for (const item of claimed) {
    try {
      await deliver(item, deps);
      await markDeliveryDelivered(fund, item.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[roleplay-delivery] ${item.sessionId} attempt ${String(item.attempts)}: ${reason}`);
      try {
        await markDeliveryFailed(fund, item.id, item.attempts, reason);
      } catch (markError) {
        console.error("[roleplay-delivery] mark-failed failed:", markError);
      }
    }
  }
}

async function deliver(item: ClaimedDelivery, deps: DeliveryDeps): Promise<void> {
  if (item.target.kind === "webhook") {
    await deliverWebhookEnvelope(item.target.url, item.envelope, deps);
    return;
  }
  if (item.target.kind === "lti11") {
    await deliverLti11Outcome(item.target, item.envelope, deps);
    return;
  }
  throw new Error(`No delivery adapter for kind "${String((item.target as { kind: string }).kind)}".`);
}

/** POST one signed envelope. Exported so the adapter can be tested without an outbox. */
export async function deliverWebhookEnvelope(
  url: string,
  envelope: RoleplayResultEnvelope,
  deps: Pick<DeliveryDeps, "fetch" | "lookup" | "secret" | "now">,
): Promise<void> {
  if (!deps.secret) {
    throw new Error("webhook_not_configured");
  }
  await assertSafeDeliveryUrl(url, deps.lookup);

  const body = JSON.stringify(envelope);
  const signed = webhookSignatureHeaders(deps.secret, body, deps.now().getTime());
  const response = await deps.fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...signed.headers,
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Delivery endpoint returned ${String(response.status)}.`);
  }
}

export function deliveryAttemptsExhausted(attempts: number): boolean {
  return attempts >= ROLEPLAY_DELIVERY_MAX_ATTEMPTS;
}
