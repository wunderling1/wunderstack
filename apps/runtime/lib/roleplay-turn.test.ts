import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RoleplayMessage, RoleplayScenarioPrompt, RoleplayTurnResult } from "@wunderstack/agents";
import type { RoleplayEndReason, RoleplayEvent } from "@wunderstack/shared";

import { roleplayTurnEvents, type RoleplayTurnDeps } from "./roleplay-turn";

const scenario = {
  partnerRole: "Medewerker",
  userRole: "Leidinggevende",
  userTitle: "Leidinggevende",
  persona: "",
  contextDescription: "",
  hiddenInformation: "",
  learningObjective: "",
  secondaryObjective: "",
  commonPitfalls: [],
  instructions: "",
  openingLine: "",
  endCondition: "",
  rubric: { criteria: [], reviewPrompt: "", passThreshold: 5.5 },
} as unknown as RoleplayScenarioPrompt;

function turnResult(overrides: Partial<RoleplayTurnResult> = {}): RoleplayTurnResult {
  return {
    text: "Daar wil ik het niet over hebben.",
    conversationEnd: false,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    model: "mistral-medium",
    promptVersion: "2026-08-25-port",
    ...overrides,
  };
}

interface Recorded {
  events: RoleplayEvent[];
  persisted: Array<{ userMessage: string; assistantMessage: string; endReason: RoleplayEndReason | null }>;
  closingFlags: boolean[];
  order: string[];
}

async function run(
  overrides: Partial<RoleplayTurnDeps> & { result?: RoleplayTurnResult } = {},
): Promise<Recorded> {
  const recorded: Recorded = { events: [], persisted: [], closingFlags: [], order: [] };
  const history: RoleplayMessage[] = [{ role: "assistant", content: "Goedemiddag." }];

  const deps: RoleplayTurnDeps = {
    message: "Hoe gaat het met de planning?",
    scenario,
    turnsUsed: 3,
    maxTurns: 12,
    loadTranscript: async () => history,
    nextTurn: async ({ isClosingTurn }) => {
      recorded.closingFlags.push(isClosingTurn);
      return overrides.result ?? turnResult();
    },
    persist: async (args) => {
      recorded.order.push("persist");
      recorded.persisted.push(args);
    },
    ...overrides,
  };

  for await (const event of roleplayTurnEvents(deps)) {
    recorded.order.push(`event:${event.type}`);
    recorded.events.push(event);
  }
  return recorded;
}

describe("roleplayTurnEvents", () => {
  it("emits status, text, turn and done in that order", async () => {
    const { events } = await run();
    assert.deepEqual(
      events.map((event) => event.type),
      ["status", "text", "turn", "done"],
    );
  });

  it("reports the authoritative counter from the claim, not client arithmetic", async () => {
    const { events } = await run({ turnsUsed: 7, maxTurns: 12 });
    const turn = events.find((event) => event.type === "turn");
    assert.equal(turn?.type === "turn" && turn.turnsUsed, 7);
    assert.equal(turn?.type === "turn" && turn.maxTurns, 12);
  });

  it("does not ask the persona to wrap up while turns remain", async () => {
    const { closingFlags } = await run({ turnsUsed: 11, maxTurns: 12 });
    assert.deepEqual(closingFlags, [false]);
  });

  it("asks the persona to wrap up on the last turn the budget allows", async () => {
    // The claim already incremented, so turnsUsed === maxTurns is the granted final turn.
    const { closingFlags } = await run({ turnsUsed: 12, maxTurns: 12 });
    assert.deepEqual(closingFlags, [true]);
  });

  it("leaves the end reason null while the conversation continues", async () => {
    const { events, persisted } = await run();
    const turn = events.find((event) => event.type === "turn");
    assert.equal(turn?.type === "turn" && turn.endReason, null);
    assert.equal(persisted[0]?.endReason, null);
  });

  it("records a persona-closed conversation as completed", async () => {
    const { events } = await run({
      turnsUsed: 4,
      maxTurns: 12,
      result: turnResult({ conversationEnd: true }),
    });
    const turn = events.find((event) => event.type === "turn");
    assert.equal(turn?.type === "turn" && turn.endReason, "completed");
  });

  it("records a conversation that ran out of budget as max_turns_reached", async () => {
    // Both conditions hold on the final turn; the budget is the more accurate explanation of why
    // it ended, and it is what distinguishes a rushed ending from a natural one in the evals.
    const { events } = await run({
      turnsUsed: 12,
      maxTurns: 12,
      result: turnResult({ conversationEnd: true }),
    });
    const turn = events.find((event) => event.type === "turn");
    assert.equal(turn?.type === "turn" && turn.endReason, "max_turns_reached");
  });

  it("stores the exchange before showing it, so a visible reply is always a stored reply", async () => {
    const { order } = await run();
    assert.ok(order.indexOf("persist") < order.indexOf("event:text"));
  });

  it("persists the learner's message and the model's reply verbatim", async () => {
    const { persisted } = await run({ result: turnResult({ text: "Dat lukt niet." }) });
    assert.deepEqual(persisted, [
      {
        userMessage: "Hoe gaat het met de planning?",
        assistantMessage: "Dat lukt niet.",
        endReason: null,
      },
    ]);
  });

  it("passes the stored transcript to the agent rather than re-deriving it", async () => {
    let seen: RoleplayMessage[] = [];
    await run({
      loadTranscript: async () => [
        { role: "assistant", content: "Goedemiddag." },
        { role: "user", content: "Hoi." },
      ],
      nextTurn: async ({ history }) => {
        seen = history;
        return turnResult();
      },
    });
    assert.equal(seen.length, 2);
  });

  it("does not emit a turn event when persisting fails", async () => {
    // A reply the learner can see but that was never stored would vanish on reload and would be
    // missing from the transcript the reviewer scores. Better no event than a lying one.
    const events: RoleplayEvent[] = [];
    await assert.rejects(async () => {
      for await (const event of roleplayTurnEvents({
        message: "Hoi",
        scenario,
        turnsUsed: 1,
        maxTurns: 12,
        loadTranscript: async () => [],
        nextTurn: async () => turnResult(),
        persist: async () => {
          throw new Error("db down");
        },
      })) {
        events.push(event);
      }
    });
    assert.deepEqual(
      events.map((event) => event.type),
      ["status"],
    );
  });
});
