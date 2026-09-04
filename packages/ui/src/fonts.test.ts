/**
 * Sovereignty: the default request path must not load fonts from a US CDN.
 * Spectral is the Google Fonts family, self-hosted next to Inter.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fontsCss = readFileSync(resolve(here, "fonts.css"), "utf8");
const semantic = readFileSync(resolve(here, "tokens/semantic.css"), "utf8");
const fontsDir = resolve(here, "fonts");

describe("fonts.css — self-hosted families", () => {
  it("does not load Google Fonts or other US font CDNs", () => {
    assert.equal(fontsCss.includes("fonts.googleapis.com"), false);
    assert.equal(fontsCss.includes("fonts.gstatic.com"), false);
    assert.equal(fontsCss.includes("use.typekit.net"), false);
  });

  it("declares Inter for body and Spectral for display", () => {
    assert.match(fontsCss, /font-family:\s*"Inter"/);
    assert.match(fontsCss, /font-family:\s*"Spectral"/);
    assert.match(semantic, /--font-display:\s*"Spectral"/);
    assert.match(semantic, /--font-body:\s*"Inter"/);
    assert.match(semantic, /--tracking-display:\s*-1\.5px/);
    assert.match(semantic, /\.font-display\s*\{[^}]*letter-spacing:\s*var\(--tracking-display\)/s);
  });

  it("ships OFL.txt and the three latin woff2 binaries next to fonts.css", () => {
    for (const name of [
      "OFL.txt",
      "inter-latin-wght-normal.woff2",
      "spectral-latin-400-normal.woff2",
      "spectral-latin-600-normal.woff2",
    ]) {
      assert.equal(existsSync(resolve(fontsDir, name)), true, `missing fonts/${name}`);
    }
  });
});
