import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");

test("Instellingen is one SettingsView; fund is read-only, admin can write", () => {
  const fund = readFileSync(join(ROOT, "app/(fund)/settings/page.tsx"), "utf8");
  const admin = readFileSync(
    join(ROOT, "app/(admin)/admin/funds/[fundKey]/(fund-console)/settings/page.tsx"),
    "utf8",
  );
  assert.match(fund, /SettingsView/);
  assert.match(fund, /canWrite=\{false\}/);
  assert.match(admin, /SettingsView/);
  assert.match(admin, /canWrite/);
  assert.doesNotMatch(admin, /canWrite=\{false\}/);
});

test("legacy branding/accounts/manage pages redirect to settings", () => {
  for (const segment of ["branding", "accounts", "manage"]) {
    const source = readFileSync(
      join(
        ROOT,
        `app/(admin)/admin/funds/[fundKey]/(fund-console)/${segment}/page.tsx`,
      ),
      "utf8",
    );
    assert.match(source, /redirect\(/);
    assert.match(source, /\/settings/);
  }
});

test("each shared panel exists once under components/fund", () => {
  const panels = [
    "overview.tsx",
    "conversations.tsx",
    "signals.tsx",
    "settings.tsx",
    "agent-overview-panel.tsx",
    "agent-corpus-panel.tsx",
    "agent-publication.tsx",
    "branding-form.tsx",
  ];
  for (const name of panels) {
    assert.equal(existsSync(join(ROOT, "components/fund", name)), true, name);
  }
  const settings = readFileSync(join(ROOT, "components/fund/settings.tsx"), "utf8");
  assert.match(settings, /canWrite/);
  assert.match(settings, /BrandingForm/);
  assert.match(settings, /AddUserForm/);
  assert.match(settings, /DeactivateForm/);
});
