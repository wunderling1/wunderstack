import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { getInstance, updateTenantConfig } from "./agent-instances.js";
import { closeDb } from "./client.js";

/**
 * Texts stay per agent-instance: updating one must not change the other (PR-D DoD).
 * Skipped without DATABASE_URL.
 */
const ready = Boolean(process.env.DATABASE_URL);

describe("agent texts isolation", { skip: !ready }, () => {
  // The postgres.js pool holds the event loop open, which would hang the test run.
  after(closeDb);

  it("updating texts on one agent does not change the other agent", async () => {
    const fundKey = process.env.TEXTS_ISOLATION_FUND ?? "oomt";
    const cao = await getInstance(fundKey, "cao");
    const arbo = await getInstance(fundKey, "arbo");
    if (!cao || !arbo) {
      // No dual-agent fund in this DB — skip without failing CI.
      return;
    }

    const caoBefore = { ...(cao.texts as Record<string, unknown>) };
    const arboBefore = { ...(arbo.texts as Record<string, unknown>) };
    const marker = `iso-${Date.now()}`;

    try {
      await updateTenantConfig({
        tenantId: fundKey,
        agentKey: "cao",
        texts: { ...caoBefore, tagline: marker },
      });
      const caoAfter = await getInstance(fundKey, "cao");
      const arboAfter = await getInstance(fundKey, "arbo");
      assert.equal((caoAfter?.texts as { tagline?: string } | undefined)?.tagline, marker);
      assert.deepEqual(arboAfter?.texts, arboBefore);
    } finally {
      await updateTenantConfig({
        tenantId: fundKey,
        agentKey: "cao",
        texts: caoBefore,
      });
    }
  });
});
