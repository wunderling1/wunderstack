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
const motion = readFileSync(resolve(here, "../motion.css"), "utf8");

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
  "--duration-sheen",
  "--duration-dots",
  "--duration-dot-stagger",
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

  it("defaults --motion-sheen to infinite", () => {
    assert.ok(
      /--motion-sheen:\s*var\(--duration-sheen\)\s+var\(--ease-linear\)\s+infinite\s*;/.test(beforeMedia),
      "default --motion-sheen must run infinite while the turn is in flight",
    );
  });

  it("defaults --motion-dots to infinite", () => {
    assert.ok(
      /--motion-dots:\s*var\(--duration-dots\)\s+var\(--ease-standard\)\s+infinite\s*;/.test(beforeMedia),
      "default --motion-dots must run infinite while the write step is in flight",
    );
  });
});

describe("semantic.css — reduced motion hands the sheen back a colour", () => {
  it("freezes --motion-sheen (one tick, not infinite at 0.01ms)", () => {
    assert.ok(
      /--motion-sheen:\s*var\(--duration-sheen\)\s+var\(--ease-linear\)\s+1\s*;/.test(block),
      "--motion-sheen must be a single iteration under reduced motion",
    );
    assert.ok(
      !/--motion-sheen:[^;]*infinite/.test(block),
      "--motion-sheen must not stay infinite inside prefers-reduced-motion",
    );
  });

  it("freezes --motion-dots (one tick, not infinite at 0.01ms)", () => {
    assert.ok(
      /--motion-dots:\s*var\(--duration-dots\)\s+var\(--ease-standard\)\s+1\s*;/.test(block),
      "--motion-dots must be a single iteration under reduced motion",
    );
    assert.ok(
      !/--motion-dots:[^;]*infinite/.test(block),
      "--motion-dots must not stay infinite inside prefers-reduced-motion",
    );
  });

  it("drops the gradient so the text is not clipped to a frozen sheen", () => {
    const rule = block.match(/\.motion-sheen\s*\{[^}]+\}/)?.[0] ?? "";
    assert.ok(rule.length > 0, "prefers-reduced-motion block must override .motion-sheen");
    assert.match(rule, /background-image:\s*none/);
    // Both, because the sheen sets `color: transparent` and WebKit needs the fill colour reset.
    assert.match(rule, /color:\s*var\(--color-text-muted\)/);
    assert.match(rule, /-webkit-text-fill-color:\s*var\(--color-text-muted\)/);
  });
});

describe("motion.css — .motion-spin", () => {
  it("applies animation: motion-spin var(--motion-spin)", () => {
    assert.ok(
      /\.motion-spin\s*\{[^}]*animation:\s*motion-spin\s+var\(--motion-spin\)/.test(motion),
      ".motion-spin must use the --motion-spin token (no literal duration)",
    );
  });

  it("does not use a literal time value on the spin animation", () => {
    const spinBlock = motion.match(/\.motion-spin\s*\{[^}]+\}/)?.[0] ?? "";
    assert.ok(spinBlock.length > 0, ".motion-spin rule must exist");
    assert.ok(
      !/[0-9]+m?s/.test(spinBlock),
      `.motion-spin must not contain a literal time value: found ${spinBlock}`,
    );
  });
});

describe("motion.css — keyframes placement", () => {
  /*
   * A keyframes rule gains nothing from a cascade layer, and WebKit has shipped versions that
   * fail to resolve an animation name declared inside one — freezing every loop at once. This is
   * the assertion that keeps them out.
   */
  it("declares every @keyframes at the top level, never inside @layer", () => {
    const declarations = [...motion.matchAll(/^([ \t]*)@keyframes\s+([\w-]+)/gm)];
    assert.ok(declarations.length >= 5, "expected the motion keyframes to be declared in motion.css");
    for (const [, indent, name] of declarations) {
      assert.equal(indent, "", `@keyframes ${String(name)} must not be nested inside a layer`);
    }
  });

  it("still declares the keyframes every motion class references", () => {
    for (const name of [
      "motion-enter-fade",
      "motion-enter-up",
      "motion-spin",
      "motion-pulse",
      "motion-sheen",
      "motion-dots",
    ]) {
      assert.match(motion, new RegExp(`^@keyframes ${name}\\b`, "m"));
    }
  });
});

describe("motion.css — .motion-sheen", () => {
  const sheenBlock = motion.match(/\.motion-sheen\s*\{[^}]+\}/)?.[0] ?? "";

  it("applies animation: motion-sheen var(--motion-sheen)", () => {
    assert.ok(sheenBlock.length > 0, ".motion-sheen rule must exist");
    assert.match(sheenBlock, /animation:\s*motion-sheen\s+var\(--motion-sheen\)/);
  });

  it("does not use a literal time value on the sheen animation", () => {
    assert.ok(
      !/[0-9]+m?s[;\s)]/.test(sheenBlock),
      `.motion-sheen must not contain a literal time value: found ${sheenBlock}`,
    );
  });

  it("promotes the layer so WebKit repaints the travelling gradient", () => {
    assert.match(sheenBlock, /will-change:\s*background-position/);
  });

  it("clips to the text and takes its colours from semantic tokens", () => {
    assert.match(sheenBlock, /background-clip:\s*text/);
    assert.match(sheenBlock, /color:\s*transparent/);
    assert.ok(
      !/#[0-9a-f]{3,8}/i.test(sheenBlock),
      "the sheen gradient must use semantic colour tokens, not raw hex",
    );
  });
});

describe("motion.css — .motion-dots", () => {
  const dotsBlock = motion.match(/\.motion-dots\s*\{[^}]+\}/)?.[0] ?? "";

  it("applies animation: motion-dots var(--motion-dots)", () => {
    assert.ok(dotsBlock.length > 0, ".motion-dots rule must exist");
    assert.match(dotsBlock, /animation:\s*motion-dots\s+var\(--motion-dots\)/);
  });

  it("staggers via the duration token, never a literal delay", () => {
    assert.match(dotsBlock, /animation-delay:\s*calc\(var\(--i,\s*0\)\s*\*\s*var\(--duration-dot-stagger\)\)/);
    assert.ok(
      !/[0-9]+m?s[;\s)]/.test(dotsBlock),
      `.motion-dots must not contain a literal time value: found ${dotsBlock}`,
    );
  });
});
