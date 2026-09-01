import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ACTION_FILES = [
  "../app/(admin)/admin/funds/actions.ts",
  "../app/(admin)/admin/funds/[fundKey]/actions.ts",
  "../app/(admin)/admin/funds/[fundKey]/(fund-console)/branding/actions.ts",
  "../app/(admin)/admin/funds/[fundKey]/agents/[agentKey]/actions.ts",
  "../app/(admin)/admin/funds/[fundKey]/agents/[agentKey]/lti/actions.ts",
  "../app/(admin)/admin/funds/[fundKey]/agents/[agentKey]/scenarios/actions.ts",
] as const;

const EXPECTED_ACTIONS = [
  "addFundAgentAction",
  "addFundUserAction",
  "changeFundUserEmailAction",
  "createFundAction",
  "createLtiConsumerAction",
  "createScenarioAction",
  "deactivateFundAction",
  "deactivateLtiConsumerAction",
  "pinCorpusAction",
  "resetFundUserPasswordAction",
  "rotateInstanceKeyAction",
  "setLtiGradePassbackAction",
  "updateCorsAction",
  "updateFundNameAction",
  "updateFundThemeAction",
  "updateScenarioAction",
  "updateTextsAction",
] as const;

function readRelative(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

function exportedActionNames(source: string): string[] {
  return [...source.matchAll(/^export async function (\w+)/gm)].map((match) => match[1] ?? "");
}

function actionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `missing ${name}`);
  const rest = source.slice(start);
  const next = rest.search(/\nexport async function /);
  return next === -1 ? rest : rest.slice(0, next);
}

test("every write action is listed exactly once", () => {
  const found: string[] = [];
  for (const file of ACTION_FILES) {
    found.push(...exportedActionNames(readRelative(file)));
  }
  assert.deepEqual([...found].sort(), [...EXPECTED_ACTIONS].sort());
});

test("a fund-user is denied by assertAdmin on every write action, not only a hidden button", () => {
  for (const file of ACTION_FILES) {
    const source = readRelative(file);
    for (const name of exportedActionNames(source)) {
      const body = actionBody(source, name);
      assert.match(body, /await assertAdmin\(\);/, `${file} ${name}`);
      const assertAt = body.indexOf("await assertAdmin();");
      const firstAwait = body.indexOf("await ");
      assert.equal(assertAt, firstAwait, `${name} must deny before any other await`);
    }
  }
});

test("schema dump POST is a write and returns 403 for non-admins", () => {
  const source = readRelative("../app/(admin)/admin/funds/[fundKey]/export/route.ts");
  assert.match(source, /decideAccess\(session, "admin"\)/);
  assert.match(source, /new Response\("forbidden", \{ status: 403 \}\)/);
});

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walkTsx(path, out);
      continue;
    }
    if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push(path);
  }
  return out;
}

const REDIRECT_PAGES = new Set([
  "branding/page.tsx",
  "accounts/page.tsx",
  "manage/page.tsx",
  "distribution/page.tsx",
  "texts/page.tsx",
  "lti/page.tsx",
  "embed/page.tsx",
]);

test("no live link points at a removed screen (legacy URLs only exist as redirects)", () => {
  const root = join(import.meta.dirname, "..");
  const files = [
    ...walkTsx(join(root, "app")),
    ...walkTsx(join(root, "components")),
  ];
  const forbidden =
    /href=\{[^}]*\/(branding|accounts|manage|distribution|texts|lti|embed)[`'"]/;
  for (const file of files) {
    const basename = file.split("/").slice(-2).join("/");
    if (REDIRECT_PAGES.has(basename)) continue;
    if (file.includes(".test.")) continue;
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, forbidden, file);
  }
});
