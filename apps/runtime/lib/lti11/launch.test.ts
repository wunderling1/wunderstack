import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectLaunchParams,
  LTI11_MAX_TIMESTAMP_SKEW_SECONDS,
  parseLaunchPathHint,
  resolveScenarioSlug,
} from "./launch";

describe("parseLaunchPathHint", () => {
  it("only accepts gesprek/<slug> — no learning-path launch in v1", () => {
    assert.deepEqual(parseLaunchPathHint(["gesprek", "vca-weigering"]), { slug: "vca-weigering" });
    assert.equal(parseLaunchPathHint(["leerpad", "module-1"]), null);
    assert.equal(parseLaunchPathHint(["gesprek"]), null);
    assert.equal(parseLaunchPathHint(["gesprek", "Not A Slug"]), null);
  });
});

describe("resolveScenarioSlug", () => {
  it("prefers the signed path hint over custom/query params", () => {
    assert.equal(
      resolveScenarioSlug(
        { custom_template_slug: "other", template_slug: "third" },
        { slug: "from-path" },
      ),
      "from-path",
    );
    assert.equal(resolveScenarioSlug({ custom_template_slug: "from-custom" }, null), "from-custom");
    assert.equal(resolveScenarioSlug({ scenario_slug: "from-query" }, null), "from-query");
    assert.equal(resolveScenarioSlug({}, null), null);
  });
});

describe("collectLaunchParams", () => {
  it("lets query values override the form, matching OAuth signature collection", () => {
    const form = new FormData();
    form.set("oauth_nonce", "form");
    form.set("user_id", "u-1");
    const search = new URLSearchParams({ oauth_nonce: "query" });
    assert.deepEqual(collectLaunchParams(form, search), {
      oauth_nonce: "query",
      user_id: "u-1",
    });
  });
});

describe("LTI11_MAX_TIMESTAMP_SKEW_SECONDS", () => {
  it("is 90 minutes", () => {
    assert.equal(LTI11_MAX_TIMESTAMP_SKEW_SECONDS, 90 * 60);
  });
});
