import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { blackPaths, htmlMode, themeColor, themeForPath } from "./page-theme.ts";

const here = dirname(fileURLToPath(import.meta.url));
const blackLayout = readFileSync(resolve(here, "../app/(black)/layout.tsx"), "utf8");
const whiteLayout = readFileSync(resolve(here, "../app/(white)/layout.tsx"), "utf8");

describe("themeForPath", () => {
  it("uses black for the home canvas", () => {
    assert.equal(themeForPath("/"), "black");
    assert.equal(htmlMode("black"), "dark");
    assert.equal(themeColor("black"), "#0f0e0d");
  });

  it("keeps agent pages white so the embed sits on the product default", () => {
    assert.equal(themeForPath("/agents/cao"), "white");
    assert.equal(htmlMode("white"), undefined);
    assert.equal(themeColor("white"), "#fafaf9");
  });

  it("defaults unknown paths to white", () => {
    assert.equal(themeForPath(""), "white");
    assert.equal(themeForPath("/niet-bestaand"), "white");
  });

  it("keeps BLACK_PATHS as only home — matching (black)/(white) route groups", () => {
    assert.deepEqual(blackPaths(), ["/"]);
    assert.match(blackLayout, /htmlMode\("black"\)/);
    assert.match(blackLayout, /data-mode=\{htmlMode\("black"\)\}/);
    assert.doesNotMatch(whiteLayout, /data-mode/);
    assert.doesNotMatch(whiteLayout, /htmlMode/);
  });
});
