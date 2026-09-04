/**
 * Display contract for the shared chat-scroll adapter. Source-level: the native runner cannot
 * import a `"use client"` hook (same constraint as chip.test.ts).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "use-scroll-anchor.ts"), "utf8");

describe("useScrollAnchor — shared adapter (source)", () => {
  it("never calls scrollIntoView — that would move a host page around the embed iframe", () => {
    assert.equal(source.includes(".scrollIntoView"), false);
    assert.equal(/\bscrollIntoView\s*\(/.test(source), false);
  });

  it("only mutates the given container via scrollTo", () => {
    assert.ok(source.includes("container.scrollTo"));
    assert.equal(source.includes("window.scroll"), false);
    assert.equal(source.includes("document.documentElement"), false);
  });

  it("drives createScrollAnchor rather than a per-app copy of the state machine", () => {
    assert.ok(source.includes("createScrollAnchor"));
  });
});
