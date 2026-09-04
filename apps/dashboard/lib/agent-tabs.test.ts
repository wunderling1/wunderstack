import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { agentTabHref, agentTabs } from "./agent-tabs";
import { agentShowsQualityColumns, buildCorpusDecision } from "./agent-profile";

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

test("approval and gate verdict point at the same corpus fingerprint", () => {
  const decision = buildCorpusDecision({
    fingerprint: "a1b2c3d4e5f6",
    documentVersions: ["cao-2026.08", "cao-2026.01"],
    pinnedReleaseTag: "a1b2c3d4e5f6",
    gateResult: null,
    gateEvaluatedAt: null,
    artefactUrl: null,
  });
  assert.equal(decision.gate.fingerprint, decision.approval.fingerprint);
  assert.equal(decision.fingerprint, "a1b2c3d4e5f6");
  assert.equal(decision.approval.approved, true);
  assert.equal(decision.approval.expired, false);
  // The document version stays visible, but it is not what the approval is pinned to.
  assert.equal(decision.latestVersion, "cao-2026.08");
});

test("a changed corpus expires the approval instead of staying green", () => {
  const decision = buildCorpusDecision({
    fingerprint: "999888777666",
    documentVersions: ["cao-2026.08", "cao-2026.01"],
    pinnedReleaseTag: "a1b2c3d4e5f6",
    gateResult: null,
    gateEvaluatedAt: null,
    artefactUrl: null,
  });
  assert.equal(decision.approval.approved, false);
  assert.equal(decision.approval.expired, true);
});

test("empty corpus keeps gate and approval on the same absent fingerprint", () => {
  const decision = buildCorpusDecision({
    fingerprint: null,
    documentVersions: [],
    pinnedReleaseTag: null,
    gateResult: null,
    gateEvaluatedAt: null,
    artefactUrl: null,
  });
  assert.equal(decision.gate.fingerprint, decision.approval.fingerprint);
  assert.equal(decision.fingerprint, null);
  assert.equal(decision.approval.approved, false);
  assert.equal(decision.approval.expired, false);
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
