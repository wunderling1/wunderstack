/**
 * Grant SELECT on the control plane + fund schemas to one named dashboard/reader login.
 * Never GRANT TO PUBLIC. control.users (password_hash) is included so Credentials login works
 * for that role only.
 *
 *   DB_READER_ROLE=testadmin pnpm --filter @wunderstack/db-scripts grant-reader
 */

import { env } from "@wunderstack/shared";
import {
  closeDb,
  getDb,
  grantReaderOnControlSql,
  grantReaderOnFundSchemaSql,
  quoteLiteral,
  SCHEMA_NAME_RE,
  sql,
} from "@wunderstack/db";

const ROLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

async function listFundSchemas(): Promise<string[]> {
  const rows = (await getDb().execute(sql`
    SELECT nspname
    FROM pg_namespace
    WHERE nspname ~ '^fund_'
    ORDER BY nspname
  `)) as unknown as Array<{ nspname: string }>;
  return rows.map((row) => row.nspname).filter((name) => SCHEMA_NAME_RE.test(name));
}

async function main(): Promise<void> {
  const role = env.DB_READER_ROLE?.trim();
  if (!role || !ROLE_NAME_RE.test(role)) {
    console.error("DB_READER_ROLE is unset or not a Postgres identifier. Refusing to GRANT.");
    process.exitCode = 1;
    return;
  }

  const roleExists = (await getDb().execute(
    sql.raw(`SELECT 1 AS ok FROM pg_roles WHERE rolname = ${quoteLiteral(role)}`),
  )) as unknown as Array<{ ok: number }>;
  if (roleExists.length === 0) {
    console.error(`Role ${role} does not exist. Create the Scalingo read-only login first.`);
    process.exitCode = 1;
    return;
  }

  for (const statement of grantReaderOnControlSql(role)) {
    await getDb().execute(sql.raw(statement));
  }

  for (const schemaName of await listFundSchemas()) {
    for (const statement of grantReaderOnFundSchemaSql(role, schemaName)) {
      await getDb().execute(sql.raw(statement));
    }
  }

  console.log(`Granted SELECT on control + fund_* schemas to ${role} (not PUBLIC).`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
