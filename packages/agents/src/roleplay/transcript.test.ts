import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONVERSATION_HISTORY_WINDOW,
  formatHistoryForPrompt,
  formatTranscriptForReview,
  windowHistory,
} from "./transcript";
import type { RoleplayMessage } from "./types";

function transcript(length: number): RoleplayMessage[] {
  return Array.from({ length }, (_, index) => ({
    role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `bericht ${String(index)}`,
  }));
}

describe("windowHistory", () => {
  it("keeps the most recent messages, oldest first", () => {
    const windowed = windowHistory(transcript(40));
    assert.equal(windowed.length, CONVERSATION_HISTORY_WINDOW);
    assert.equal(windowed[0]?.content, "bericht 10");
    assert.equal(windowed.at(-1)?.content, "bericht 39");
  });

  it("returns a copy, so a caller cannot mutate the stored transcript", () => {
    const original = transcript(3);
    const windowed = windowHistory(original);
    windowed.pop();
    assert.equal(original.length, 3);
  });

  it("leaves a short conversation untouched", () => {
    assert.equal(windowHistory(transcript(5)).length, 5);
  });
});

describe("formatHistoryForPrompt", () => {
  it("quotes the learner and leaves the persona plain", () => {
    const formatted = formatHistoryForPrompt(
      [
        { role: "user", content: "Goedemiddag" },
        { role: "assistant", content: "Eindelijk iemand." },
      ],
      "Klantadviseur",
      "een boze klant",
    );
    assert.equal(formatted, 'Klantadviseur: "Goedemiddag"\n\neen boze klant: Eindelijk iemand.');
  });

  it("is empty for an empty history, so the caller can skip the whole block", () => {
    assert.equal(formatHistoryForPrompt([], "Klantadviseur", "klant"), "");
  });
});

describe("formatTranscriptForReview", () => {
  it("uses the human/ai vocabulary the review prompt describes", () => {
    const json = formatTranscriptForReview(
      [
        { role: "user", content: "Goedemiddag" },
        { role: "assistant", content: "Eindelijk iemand." },
      ],
      "Klantadviseur",
    );
    assert.deepEqual(JSON.parse(json), [
      { type: "human", content: 'Klantadviseur: "Goedemiddag"' },
      { type: "ai", content: "Eindelijk iemand." },
    ]);
  });

  it("renders an empty conversation as an empty array, not as nothing", () => {
    assert.equal(formatTranscriptForReview([], "Klantadviseur"), "[]");
  });

  it("has no window — a long conversation reaches the reviewer whole", () => {
    const parsed = JSON.parse(formatTranscriptForReview(transcript(80), "Klantadviseur")) as unknown[];
    assert.equal(parsed.length, 80);
  });
});
