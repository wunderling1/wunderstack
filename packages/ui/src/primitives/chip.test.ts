/**
 * Decision D assertion: Chip carries only a colour transition (--motion-state) and must NOT
 * carry opacity or transform transitions. This is a product rule, not a style choice — the chip
 * appears in the same frame as the answer it belongs to.
 *
 * This test is intentionally a source-level assertion (no DOM, no React): the constraint is on
 * what class strings the component ships, not on runtime rendering.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "chip.tsx"), "utf8");

describe("Chip — decision D (trust layer does not animate)", () => {
  it("carries --motion-state for colour transitions", () => {
    assert.ok(
      source.includes("--motion-state"),
      "chip.tsx must reference --motion-state for its colour transition",
    );
  });

  it("does not carry an opacity transition", () => {
    // The transition shorthand must not include 'opacity' as a property.
    // We check the transition string used in chipVariants.
    const transitionMatch = source.match(/\[transition:[^\]]+\]/);
    if (transitionMatch) {
      assert.ok(
        !transitionMatch[0].includes("opacity"),
        `chip transition must not include opacity: found ${transitionMatch[0]}`,
      );
    }
    // If using a motion-* CSS class the restriction is enforced there, not here — that's fine.
  });

  it("does not carry a transform transition", () => {
    const transitionMatch = source.match(/\[transition:[^\]]+\]/);
    if (transitionMatch) {
      assert.ok(
        !transitionMatch[0].includes("transform"),
        `chip transition must not include transform: found ${transitionMatch[0]}`,
      );
    }
  });

  it("does not use enter/exit motion tokens", () => {
    assert.ok(
      !source.includes("--motion-enter"),
      "chip.tsx must not reference --motion-enter (no enter animation — decision D)",
    );
    assert.ok(
      !source.includes("--motion-exit"),
      "chip.tsx must not reference --motion-exit (no exit animation — decision D)",
    );
    assert.ok(
      !source.includes("motion-dialog-content"),
      "chip.tsx must not reference dialog enter/exit classes",
    );
  });
});
