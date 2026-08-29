import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("list-fund-sets.ts", import.meta.url));

describe("list-fund-sets", () => {
  it("prints a non-empty JSON profile array", () => {
    const raw = execFileSync("tsx", [script], { encoding: "utf8" });
    const profiles = JSON.parse(raw) as unknown[];
    assert.ok(Array.isArray(profiles));
    assert.ok(profiles.length >= 4);
  });

  it("prints promote keys for the promote-check loop", () => {
    const raw = execFileSync("tsx", [script, "--promote-keys"], { encoding: "utf8" }).trim();
    assert.ok(raw.includes("demo"));
    assert.ok(raw.includes("arbo.oomt"));
  });
});
