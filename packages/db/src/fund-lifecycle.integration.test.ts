import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import {
  agentInstances,
  closeDb,
  deactivateFund,
  DumpRequiredError,
  eq,
  funds,
  getDb,
  sql,
} from "./index";
import { createFundEnvironment } from "./fund-environment";

const provisionerSet = Boolean(process.env.PROVISIONER_DATABASE_URL);
const hasDb = Boolean(process.env.DATABASE_URL);

describe("deactivateFund (integration)", { skip: !provisionerSet || !hasDb }, () => {
  const fundKey = `soft-${Date.now().toString(36)}`;

  after(async () => {
    try {
      const db = getDb();
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "fund_${fundKey}" CASCADE`));
      await db.delete(agentInstances).where(eq(agentInstances.tenantId, fundKey));
      await db.delete(funds).where(eq(funds.key, fundKey));
    } finally {
      await closeDb();
    }
  });

  it("refuses soft-delete when no fund_dumped audit exists, and leaves status active", async () => {
    await createFundEnvironment({
      fundKey,
      name: "Soft-delete proef",
      agentKeys: ["cao"],
    });

    await assert.rejects(
      () => deactivateFund({ fundKey, confirmation: fundKey }),
      (error: unknown) => error instanceof DumpRequiredError,
    );

    const [row] = await getDb().select({ status: funds.status }).from(funds).where(eq(funds.key, fundKey));
    assert.equal(row?.status, "active");
  });
});
