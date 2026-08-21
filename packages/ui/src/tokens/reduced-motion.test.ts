/**
 * Reduced-motion assertion: the @media (prefers-reduced-motion: reduce) block in semantic.css
 * must set all --duration-* tokens to 0.01ms, --motion-offset-enter to 0px, and --motion-spin
 * to a single tick (not `infinite` at 0.01ms — that would hyper-spin).
 *
 * 0.01ms (not 0): transitionend/animationend still fire so waiting code cannot hang.
 *
 * This test is the automated substitute for a Playwright reduced-motion gate until Playwright
 * is added to the repo. See docs/design/MOTION.md for the manual smoke-test steps.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const semantic = readFileSync(resolve(here, "semantic.css"), "utf8");
const styles = readFileSync(resolve(here, "../styles.css"), "utf8");

// Extract the content of the @media (prefers-reduced-motion: reduce) block.
const mediaMatch = semantic.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/);
const block: string = mediaMatch?.[1] ?? "";
const beforeMedia = semantic.slice(0, mediaMatch?.index ?? semantic.length);

const DURATION_TOKENS = [
  "--duration-50",
  "--duration-100",
  "--duration-150",
  "--duration-250",
  "--duration-400",
  "--duration-spin",
] as const;

describe("semantic.css — reduced motion block", () => {
  it("has a @media (prefers-reduced-motion: reduce) block", () => {
    assert.ok(mediaMatch, "semantic.css must contain a @media (prefers-reduced-motion: reduce) block");
  });

  for (const duration of DURATION_TOKENS) {
    it(`sets ${duration} to 0.01ms`, () => {
      assert.ok(
        block.includes(`${duration}: 0.01ms`),
        `${duration} must be 0.01ms inside prefers-reduced-motion block`,
      );
    });
  }

  it("sets --motion-offset-enter to 0px", () => {
    assert.ok(
      block.includes("--motion-offset-enter: 0px"),
      "--motion-offset-enter must be 0px inside prefers-reduced-motion block",
    );
  });

  it("uses 0.01ms not 0ms (events must still fire)", () => {
    // Guard: if someone changes 0.01ms to 0ms, events stop firing.
    assert.ok(
      DURATION_TOKENS.every((duration) => !block.includes(`${duration}: 0ms`)),
      "duration tokens must be 0.01ms, not 0ms — transitionend/animationend must still fire",
    );
  });

  it("freezes --motion-spin (one tick, not infinite at 0.01ms)", () => {
    assert.ok(
      /--motion-spin:\s*var\(--duration-spin\)\s+var\(--ease-linear\)\s+1\s*;/.test(block),
      "--motion-spin must be a single iteration under reduced motion (zeroed duration + infinite = hyper-spin)",
    );
    assert.ok(
      !/--motion-spin:[^;]*infinite/.test(block),
      "--motion-spin must not stay infinite inside prefers-reduced-motion",
    );
  });
});

describe("semantic.css — loop token (decision F)", () => {
  it("defaults --motion-spin to infinite", () => {
    assert.ok(
      /--motion-spin:\s*var\(--duration-spin\)\s+var\(--ease-linear\)\s+infinite\s*;/.test(beforeMedia),
      "default --motion-spin must run infinite while the host is mounted",
    );
  });
});

describe("styles.css — .motion-spin", () => {
  it("applies animation: motion-spin var(--motion-spin)", () => {
    assert.ok(
      /\.motion-spin\s*\{[^}]*animation:\s*motion-spin\s+var\(--motion-spin\)/.test(styles),
      ".motion-spin must use the --motion-spin token (no literal duration)",
    );
  });

  it("does not use a literal time value on the spin animation", () => {
    const spinBlock = styles.match(/\.motion-spin\s*\{[^}]+\}/)?.[0] ?? "";
    assert.ok(spinBlock.length > 0, ".motion-spin rule must exist");
    assert.ok(
      !/[0-9]+m?s/.test(spinBlock),
      `.motion-spin must not contain a literal time value: found ${spinBlock}`,
    );
  });
});
