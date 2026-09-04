import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addUsage, parseFollowUpQuestions } from "./suggest-follow-ups";

describe("parseFollowUpQuestions", () => {
  it("parses a JSON array of questions", () => {
    const raw = '["Hoe lang mag mijn proeftijd duren?","Wat gebeurt er met vakantiedagen?"]';
    assert.deepEqual(parseFollowUpQuestions(raw, "Wat is mijn opzegtermijn?"), [
      "Hoe lang mag mijn proeftijd duren?",
      "Wat gebeurt er met vakantiedagen?",
    ]);
  });

  it("parses a JSON array wrapped in a markdown fence", () => {
    const raw = '```json\n["Vraag A?","Vraag B?"]\n```';
    assert.deepEqual(parseFollowUpQuestions(raw, "Origineel?"), ["Vraag A?", "Vraag B?"]);
  });

  it("falls back to line splitting when JSON is missing", () => {
    const raw = "- Hoe werkt de proeftijd?\n- En vakantiedagen bij uitdienst?";
    assert.deepEqual(parseFollowUpQuestions(raw, "Opzegtermijn?"), [
      "Hoe werkt de proeftijd?",
      "En vakantiedagen bij uitdienst?",
    ]);
  });

  it("caps at 3 questions", () => {
    const raw = '["Een?","Twee?","Drie?","Vier?"]';
    assert.equal(parseFollowUpQuestions(raw, "Origineel?").length, 3);
  });

  it("dedupes case-insensitively and strips trailing punctuation for the key", () => {
    const raw = '["Hoe werkt proeftijd?","hoe werkt proeftijd","Andere vraag?"]';
    assert.deepEqual(parseFollowUpQuestions(raw, "Origineel?"), [
      "Hoe werkt proeftijd?",
      "Andere vraag?",
    ]);
  });

  it("filters out the original question", () => {
    const raw = '["Wat is mijn opzegtermijn?","Hoe lang mag mijn proeftijd duren?"]';
    assert.deepEqual(parseFollowUpQuestions(raw, "Wat is mijn opzegtermijn?"), [
      "Hoe lang mag mijn proeftijd duren?",
    ]);
  });

  it("returns [] for empty or empty-array output", () => {
    assert.deepEqual(parseFollowUpQuestions("", "Vraag?"), []);
    assert.deepEqual(parseFollowUpQuestions("[]", "Vraag?"), []);
  });

  it("splits a truncated JSON array that is missing the closing bracket", () => {
    const raw =
      '["Mag je onder spanning werken aan een elektrische auto volgens deze passages?","Wat moet je doen met je PBM\'s voordat je begint met werkzaamheden aan een e-voertuig?","Welke handschoenen moet je dragen';
    assert.deepEqual(parseFollowUpQuestions(raw, "Welke PBM gelden bij HV-werk?"), [
      "Mag je onder spanning werken aan een elektrische auto volgens deze passages?",
      "Wat moet je doen met je PBM's voordat je begint met werkzaamheden aan een e-voertuig?",
      "Welke handschoenen moet je dragen",
    ]);
  });

  it("splits packed quoted questions without wrapping brackets", () => {
    const raw = '"Hoe lang mag mijn proeftijd duren?","Wat gebeurt er met vakantiedagen?"';
    assert.deepEqual(parseFollowUpQuestions(raw, "Opzegtermijn?"), [
      "Hoe lang mag mijn proeftijd duren?",
      "Wat gebeurt er met vakantiedagen?",
    ]);
  });

  it("splits a single chip that still contains packed quotes (the rendered-as-one-button form)", () => {
    const raw =
      'Mag je onder spanning werken aan een elektrische auto volgens deze passages?","Wat moet je doen met je PBM\'s voordat je begint met werkzaamheden aan een e-voertuig?","Welke handschoenen moet je dragen';
    assert.deepEqual(parseFollowUpQuestions(raw, "Welke PBM gelden bij HV-werk?"), [
      "Mag je onder spanning werken aan een elektrische auto volgens deze passages?",
      "Wat moet je doen met je PBM's voordat je begint met werkzaamheden aan een e-voertuig?",
      "Welke handschoenen moet je dragen",
    ]);
  });

  it("does not split a single question that contains a comma", () => {
    const raw = '["Wat gebeurt er met loon, vakantiedagen en toeslagen?"]';
    assert.deepEqual(parseFollowUpQuestions(raw, "Opzegtermijn?"), [
      "Wat gebeurt er met loon, vakantiedagen en toeslagen?",
    ]);
  });
});

describe("addUsage", () => {
  it("sums token counts", () => {
    assert.deepEqual(
      addUsage(
        { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
      ),
      { promptTokens: 13, completionTokens: 7, totalTokens: 20 },
    );
  });
});
