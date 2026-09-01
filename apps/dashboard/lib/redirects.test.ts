import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("next.config permanent redirects map Dutch URL segments to English (S7)", () => {
  const source = readFileSync(join(import.meta.dirname, "../next.config.mjs"), "utf8");
  const pairs: Array<[string, string]> = [
    ["/gesprekken", "/conversations"],
    ["/signalen", "/signals"],
    ["/instellingen", "/settings"],
    ["/admin/funds/:fundKey/gesprekken", "/admin/funds/:fundKey/conversations"],
    ["/admin/funds/:fundKey/signalen", "/admin/funds/:fundKey/signals"],
    ["/admin/funds/:fundKey/instellingen", "/admin/funds/:fundKey/settings"],
  ];
  for (const [from, to] of pairs) {
    assert.match(source, new RegExp(`source: "${from.replace(/:/g, "\\:")}"`));
    assert.match(source, new RegExp(`destination: "${to.replace(/:/g, "\\:")}"`));
    assert.match(source, /permanent: true/);
  }
});
