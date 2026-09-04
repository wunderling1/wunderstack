import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  grantOwnerOnFundSchemaSql,
  grantReaderOnControlSql,
  grantReaderOnFundSchemaSql,
} from "./grants";
import { buildFundEnvironmentStatements } from "./fund-environment";
import { provisionDdl, recordMigrationSql, revokePublicFundSchemaSql } from "./fund-ddl";

describe("grantReaderOnControlSql / grantReaderOnFundSchemaSql", () => {
  it("matches the statements grant-reader used to inline", () => {
    assert.deepEqual(grantReaderOnControlSql("testadmin"), [
      `GRANT USAGE ON SCHEMA "control" TO "testadmin"`,
      `GRANT SELECT ON ALL TABLES IN SCHEMA "control" TO "testadmin"`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA "control" GRANT SELECT ON TABLES TO "testadmin"`,
    ]);
    assert.deepEqual(grantReaderOnFundSchemaSql("testadmin", "fund_oomt"), [
      `GRANT USAGE ON SCHEMA "fund_oomt" TO "testadmin"`,
      `GRANT SELECT ON ALL TABLES IN SCHEMA "fund_oomt" TO "testadmin"`,
    ]);
  });

  it("never GRANTs TO PUBLIC", () => {
    const sql = [
      ...grantReaderOnControlSql("reader"),
      ...grantReaderOnFundSchemaSql("reader", "fund_demo"),
      ...grantOwnerOnFundSchemaSql("owner", "fund_demo"),
    ].join("\n");
    assert.doesNotMatch(sql, /TO PUBLIC/i);
  });
});

describe("buildFundEnvironmentStatements", () => {
  it("asserts the full DDL+grant+migration statement list", () => {
    const statements = buildFundEnvironmentStatements({
      schemaName: "fund_proefonds",
      fundKey: "proefonds",
      ownerRole: "owner_role",
      readerRole: "reader_role",
    });

    const expected = [
      ...provisionDdl("fund_proefonds", "proefonds", false),
      ...revokePublicFundSchemaSql("fund_proefonds"),
      ...grantOwnerOnFundSchemaSql("owner_role", "fund_proefonds"),
      ...grantReaderOnFundSchemaSql("reader_role", "fund_proefonds"),
      recordMigrationSql("fund_proefonds", "0001_provision"),
      recordMigrationSql("fund_proefonds", "0002_roleplay"),
      recordMigrationSql("fund_proefonds", "0003_turn_outcome"),
    ];
    assert.deepEqual(statements, expected);
  });

  it("includes interaction_events_outcome_check in provision DDL", () => {
    const statements = buildFundEnvironmentStatements({
      schemaName: "fund_proefonds",
      fundKey: "proefonds",
    });
    assert.match(statements.join("\n"), /interaction_events_outcome_check/);
  });

  it("omits owner and reader grants when roles are unset (createFundEnvironment logs instead)", () => {
    const statements = buildFundEnvironmentStatements({
      schemaName: "fund_proefonds",
      fundKey: "proefonds",
    });
    assert.deepEqual(statements, [
      ...provisionDdl("fund_proefonds", "proefonds", false),
      ...revokePublicFundSchemaSql("fund_proefonds"),
      recordMigrationSql("fund_proefonds", "0001_provision"),
      recordMigrationSql("fund_proefonds", "0002_roleplay"),
      recordMigrationSql("fund_proefonds", "0003_turn_outcome"),
    ]);
    assert.doesNotMatch(statements.join("\n"), /GRANT /);
  });
});
