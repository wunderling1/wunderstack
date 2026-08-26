import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRoleplayResultEnvelope, type RoleplayResultEnvelope } from "@wunderstack/shared";

import { deliverWebhookEnvelope, deliveryAttemptsExhausted } from "./roleplay-delivery.js";
import { signWebhookBody, WEBHOOK_SIGNATURE_HEADER } from "./webhook-sign.js";

const SESSION_ID = "3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8";

function envelope(): RoleplayResultEnvelope {
  return buildRoleplayResultEnvelope({
    fund: "demo",
    occurredAt: new Date("2026-08-25T16:00:00.000Z"),
    sessionId: SESSION_ID,
    scenarioSlug: "vca-weigering",
    scenarioVersion: 1,
    origin: "webhook",
    externalUserRef: "lms-user-9",
    externalContextRef: null,
    endReason: "completed",
    turnsUsed: 8,
    maxTurns: 12,
    weightedScore: 7.5,
    passed: true,
    passThreshold: 5.5,
    feedbackSummary: "Goed gesprek.",
    criteria: [{ question: "q", feedback: "f", score: 8, weight: 100 }],
  });
}

describe("deliveryAttemptsExhausted", () => {
  it("treats the fifth attempt as terminal, matching the outbox floor", () => {
    assert.equal(deliveryAttemptsExhausted(4), false);
    assert.equal(deliveryAttemptsExhausted(5), true);
  });
});

describe("deliverWebhookEnvelope", () => {
  const publicLookup = async () => [{ address: "93.184.216.34" }];

  it("POSTs a signed JSON body and treats a 2xx as delivered", async () => {
    const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const now = new Date("2026-08-25T16:00:00.000Z");
    await deliverWebhookEnvelope("https://fonds.example/hook", envelope(), {
      secret: "shared-secret",
      lookup: publicLookup,
      now: () => now,
      fetch: async (url, init) => {
        calls.push({ url, body: init.body, headers: init.headers });
        return { ok: true, status: 202 };
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://fonds.example/hook");
    const body = calls[0]?.body ?? "";
    assert.equal(JSON.parse(body).type, "roleplay.result");
    assert.equal(
      calls[0]?.headers[WEBHOOK_SIGNATURE_HEADER],
      signWebhookBody("shared-secret", String(now.getTime()), body),
    );
  });

  it("does not follow a redirect, and retries (throws) on a non-2xx", async () => {
    await assert.rejects(
      () =>
        deliverWebhookEnvelope("https://fonds.example/hook", envelope(), {
          secret: "shared-secret",
          lookup: publicLookup,
          now: () => new Date(),
          fetch: async () => ({ ok: false, status: 500 }),
        }),
      /500/,
    );
  });

  it("refuses to send when the signing secret is missing", async () => {
    await assert.rejects(
      () =>
        deliverWebhookEnvelope("https://fonds.example/hook", envelope(), {
          secret: undefined,
          lookup: publicLookup,
          now: () => new Date(),
          fetch: async () => {
            throw new Error("fetch should not run");
          },
        }),
      /webhook_not_configured/,
    );
  });

  it("refuses a private URL before fetch runs", async () => {
    await assert.rejects(
      () =>
        deliverWebhookEnvelope("https://127.0.0.1/hook", envelope(), {
          secret: "shared-secret",
          lookup: publicLookup,
          now: () => new Date(),
          fetch: async () => {
            throw new Error("fetch should not run");
          },
        }),
      /private address/,
    );
  });
});
