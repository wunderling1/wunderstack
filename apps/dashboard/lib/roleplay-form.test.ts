import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyRoleplayScenarioDraft } from "@wunderstack/shared";
import { parseRoleplayForm } from "./roleplay-form";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

const rubric = JSON.stringify(emptyRoleplayScenarioDraft().rubric);

test("parseRoleplayForm accepts a minimal draft", () => {
  const parsed = parseRoleplayForm(
    form({
      slug: "klachtgesprek",
      title: "Klacht",
      maxTurns: "12",
      status: "draft",
      rubric,
      persona: "",
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.slug, "klachtgesprek");
  assert.equal(parsed.draft.title, "Klacht");
  assert.equal(parsed.draft.maxTurns, 12);
});

test("parseRoleplayForm lowercases the slug", () => {
  const parsed = parseRoleplayForm(
    form({ slug: "Klacht-Gesprek", maxTurns: "8", status: "draft", rubric }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.slug, "klacht-gesprek");
});

test("parseRoleplayForm rejects a slug with spaces", () => {
  const parsed = parseRoleplayForm(form({ slug: "niet goed", maxTurns: "12", status: "draft", rubric }));
  assert.equal(parsed.ok, false);
});

test("parseRoleplayForm splits pitfalls on newlines and drops blanks", () => {
  const parsed = parseRoleplayForm(
    form({
      slug: "demo",
      maxTurns: "12",
      status: "draft",
      rubric,
      commonPitfalls: "Te snel beloven\n\nNiet doorvragen\n",
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.draft.commonPitfalls, ["Te snel beloven", "Niet doorvragen"]);
});

test("parseRoleplayForm keeps only filled difficulty levels", () => {
  const parsed = parseRoleplayForm(
    form({
      slug: "demo",
      maxTurns: "12",
      status: "draft",
      rubric,
      difficulty_expert_conversation: "Wees kortaf.",
      difficulty_basic_conversation: "",
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.draft.difficulties.expert?.conversationPrompt, "Wees kortaf.");
  assert.equal(parsed.draft.difficulties.basic, undefined);
});

test("parseRoleplayForm rejects broken rubric JSON", () => {
  const parsed = parseRoleplayForm(
    form({ slug: "demo", maxTurns: "12", status: "draft", rubric: "{not-json" }),
  );
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.match(parsed.error, /rubriek/i);
});
