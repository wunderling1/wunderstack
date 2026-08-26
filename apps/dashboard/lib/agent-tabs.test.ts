import assert from "node:assert/strict";
import { test } from "node:test";
import { agentTabHref, agentTabs } from "./agent-tabs.js";

test("grounded agents show Teksten, not Scenario's", () => {
  const labels = agentTabs("cao").map((tab) => tab.label);
  assert.deepEqual(labels, ["Overzicht", "Distributie", "Teksten"]);
  assert.equal(agentTabs("arbo").some((tab) => tab.segment === "scenarios"), false);
});

test("roleplay shows Scenario's and hides Teksten", () => {
  const tabs = agentTabs("roleplay");
  assert.deepEqual(
    tabs.map((tab) => tab.segment),
    ["", "distribution", "scenarios", "lti"],
  );
  assert.equal(tabs.some((tab) => tab.segment === "texts"), false);
});

test("agentTabHref builds overview and nested paths", () => {
  assert.equal(agentTabHref("oomt", "roleplay", ""), "/admin/funds/oomt/agents/roleplay");
  assert.equal(
    agentTabHref("oomt", "roleplay", "lti"),
    "/admin/funds/oomt/agents/roleplay/lti",
  );
});
