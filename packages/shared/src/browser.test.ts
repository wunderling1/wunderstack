import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("@wunderstack/shared/browser", () => {
  it("does not import env.ts — secret names must stay out of client bundles", () => {
    const source = readFileSync(join(here, "browser.ts"), "utf8");
    assert.equal(/from ["']\.\/env(\.js)?["']/.test(source), false);
    assert.equal(/from ["']\.\/.*\/env(\.js)?["']/.test(source), false);
    assert.match(source, /contracts\/roleplay/);
  });

  it("exports roleplay contracts without loading the env module", async () => {
    const browser = await import("./browser");
    assert.equal(typeof browser.roleplayDifficultySchema.parse, "function");
    assert.equal(typeof browser.roleplayEventSchema.parse, "function");
    assert.equal("env" in browser, false);
  });
});
