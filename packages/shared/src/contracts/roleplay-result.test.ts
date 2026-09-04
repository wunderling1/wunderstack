import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRoleplayResultEnvelope,
  roleplayResultEnvelopeSchema,
} from "./roleplay-result";
import {
  roleplayExternalRefSchema,
  roleplayLti11TargetSchema,
  roleplayResultTargetSchema,
  roleplayWebhookTargetSchema,
} from "./roleplay-scenario";
import { webhookEventSchema } from "./webhook";

const SESSION_ID = "3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8";

const envelopeInput = {
  fund: "demo",
  occurredAt: new Date("2026-08-25T16:00:00.000Z"),
  sessionId: SESSION_ID,
  scenarioSlug: "vca-weigering",
  scenarioVersion: 1,
  origin: "webhook" as const,
  externalUserRef: "lms-user-9",
  externalContextRef: "course-4",
  endReason: "completed" as const,
  turnsUsed: 8,
  maxTurns: 12,
  weightedScore: 7.5,
  passed: true,
  passThreshold: 5.5,
  feedbackSummary: "Goed gesprek.",
  criteria: [{ question: "Vraagt door?", feedback: "ja", score: 8, weight: 100 }],
};

describe("roleplayWebhookTargetSchema", () => {
  it("rejects an LTI shape so a webhook caller cannot smuggle LMS fields", () => {
    assert.ok(
      roleplayWebhookTargetSchema.safeParse({ kind: "webhook", url: "https://fonds.example/hook" })
        .success,
    );
    assert.ok(
      !roleplayWebhookTargetSchema.safeParse({ kind: "lti11", url: "https://lms.example/pox" })
        .success,
    );
  });
});

describe("roleplayResultTargetSchema", () => {
  it("accepts webhook and LTI 1.1 as a discriminated union", () => {
    assert.ok(
      roleplayResultTargetSchema.safeParse({ kind: "webhook", url: "https://fonds.example/hook" })
        .success,
    );
    assert.ok(
      roleplayLti11TargetSchema.safeParse({
        kind: "lti11",
        consumerId: SESSION_ID,
        outcomeServiceUrl: "https://lms.example/pox",
        resultSourcedId: "sourced-1",
      }).success,
    );
    assert.ok(
      !roleplayResultTargetSchema.safeParse({
        kind: "lti11",
        url: "https://lms.example/pox",
      }).success,
    );
  });
});

describe("roleplayExternalRefSchema", () => {
  it("rejects an email so a launch cannot smuggle identity past R3", () => {
    assert.ok(roleplayExternalRefSchema.safeParse("lms-user-9").success);
    assert.ok(!roleplayExternalRefSchema.safeParse("naam@fonds.nl").success);
  });
});

describe("buildRoleplayResultEnvelope", () => {
  it("puts the grade on a 0-10 and a 0-1 scale, and names the session as the idempotency key", () => {
    const envelope = buildRoleplayResultEnvelope(envelopeInput);
    assert.equal(envelope.type, "roleplay.result");
    assert.equal(envelope.data.weightedScore, 7.5);
    assert.equal(envelope.data.normalizedScore, 0.75);
    assert.equal(envelope.data.sessionId, SESSION_ID);
  });

  it("is a valid inbound webhook event, so the two directions share one envelope family", () => {
    const envelope = buildRoleplayResultEnvelope(envelopeInput);
    const inbound = webhookEventSchema.parse(envelope);
    assert.equal(inbound.type, "roleplay.result");
    assert.equal(inbound.fund, "demo");
  });

  it("does not carry a transcript — the conversation stays in the fund schema", () => {
    const envelope = buildRoleplayResultEnvelope(envelopeInput);
    assert.equal("transcript" in envelope.data, false);
    assert.equal("history" in envelope.data, false);
  });

  it("rejects a payload that would send an out-of-range grade", () => {
    assert.throws(() => buildRoleplayResultEnvelope({ ...envelopeInput, weightedScore: 11 }));
  });
});

describe("roleplayResultEnvelopeSchema", () => {
  it("rejects extra fields so a future adapter cannot smuggle LMS-specific keys into the webhook body", () => {
    const envelope = buildRoleplayResultEnvelope(envelopeInput);
    assert.ok(
      !roleplayResultEnvelopeSchema.safeParse({
        ...envelope,
        data: { ...envelope.data, sourcedId: "secret" },
      }).success,
    );
  });
});
