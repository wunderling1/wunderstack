import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { agentTabHref, agentTabs } from "./agent-tabs.js";
import { agentShowsQualityColumns, buildCorpusDecision } from "./agent-profile.js";

test("grounded agents show Corpus, not Scenario's", () => {
  const labels = agentTabs("cao").map((tab) => tab.label);
  assert.deepEqual(labels, ["Overzicht", "Corpus", "Publicatie"]);
  assert.equal(agentTabs("arbo").some((tab) => tab.segment === "scenarios"), false);
  assert.equal(agentTabs("cao").some((tab) => tab.segment === "corpus"), true);
});

test("exercise agent renders Scenario's and no corpus tab", () => {
  const tabs = agentTabs("roleplay");
  assert.deepEqual(
    tabs.map((tab) => tab.segment),
    ["", "scenarios", "publication"],
  );
  assert.equal(tabs.some((tab) => tab.segment === "corpus"), false);
  assert.equal(tabs.some((tab) => tab.label === "Scenario's"), true);
});

test("agentTabHref builds fund and admin paths", () => {
  assert.equal(
    agentTabHref("admin", "oomt", "roleplay", ""),
    "/admin/funds/oomt/agents/roleplay",
  );
  assert.equal(
    agentTabHref("admin", "oomt", "cao", "corpus"),
    "/admin/funds/oomt/agents/cao/corpus",
  );
  assert.equal(agentTabHref("fund", "oomt", "cao", "publication"), "/agents/cao/publication");
});

test("exercise agent has no citation or refusal columns", () => {
  assert.equal(agentShowsQualityColumns("roleplay"), false);
  assert.equal(agentShowsQualityColumns("cao"), true);
  assert.equal(agentShowsQualityColumns("arbo"), true);
  const overview = readFileSync(
    new URL("../components/fund/agent-overview-panel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(overview, /agentShowsQualityColumns/);
  assert.doesNotMatch(overview, /Citaties/);
});

test("approval and gate verdict share the same corpus version", () => {
  const decision = buildCorpusDecision({
    documentVersions: ["cao-2026.08", "cao-2026.01"],
    pinnedReleaseTag: "cao-2026.08",
    gateResult: null,
    gateEvaluatedAt: null,
    artefactUrl: null,
  });
  assert.equal(decision.gate.corpusVersion, decision.approval.corpusVersion);
  assert.equal(decision.corpusVersion, "cao-2026.08");
  assert.equal(decision.approval.approved, true);
});

test("empty corpus keeps gate and approval on the same n.n.b. version", () => {
  const decision = buildCorpusDecision({
    documentVersions: [],
    pinnedReleaseTag: null,
    gateResult: null,
    gateEvaluatedAt: null,
    artefactUrl: null,
  });
  assert.equal(decision.gate.corpusVersion, decision.approval.corpusVersion);
  assert.equal(decision.corpusVersion, null);
  assert.equal(decision.approval.approved, false);
});

test("agent tab rendering does not switch on the roleplay key", () => {
  const source = readFileSync(new URL("./agent-tabs.ts", import.meta.url), "utf8");
  assert.match(source, /isGroundedAgentKey/);
  assert.doesNotMatch(source, /===\s*["']roleplay["']/);
});

test("key rotation sits in its own block and asks for confirmation", () => {
  const publication = readFileSync(
    new URL("../components/fund/agent-publication.tsx", import.meta.url),
    "utf8",
  );
  assert.match(publication, /Sleutelrotatie/);
  assert.match(publication, /Onomkeerbaar/);
  const rotate = readFileSync(
    new URL(
      "../app/(admin)/admin/funds/[fundKey]/agents/[agentKey]/distribution-forms.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(rotate, /name="confirmation"/);
  assert.match(rotate, /Typ/);
});

test("agent page files do not copy gate-definition thresholds", () => {
  const files = [
    "./agent-tabs.ts",
    "./agent-profile.ts",
    "../components/fund/agent-overview-panel.tsx",
    "../components/fund/agent-corpus-panel.tsx",
    "../components/fund/agent-publication.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /RETRIEVAL_STRONG_MIN_SCORE/, file);
    assert.doesNotMatch(source, /minScore/, file);
    assert.doesNotMatch(source, /thresholdDeviations/, file);
  }
});
