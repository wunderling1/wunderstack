/**
 * One-shot operator script: REVOKE PUBLIC grants on every existing fund_* schema.
 * New schemas never get those grants (`provisionDdl` no longer emits them).
 *
 *   pnpm --filter @wunderstack/db-scripts revoke-public-fund-grants
 *   pnpm --filter @wunderstack/db-scripts revoke-public-fund-grants -- --confirm
 *
 * Prints table ACLs before and after. Never logs connection strings.
 */

import { parseArgs } from "node:util";

import { closeDb, getDb, quoteLiteral, revokePublicFundSchemaSql, SCHEMA_NAME_RE, sql } from "@wunderstack/db";

interface NamespaceRow {
  nspname: string;
}

interface AclRow {
  schema: string;
  relname: string;
  relacl: string | null;
}

async function listFundSchemas(): Promise<string[]> {
  const rows = (await getDb().execute(sql`
    SELECT nspname
    FROM pg_namespace
    WHERE nspname ~ '^fund_'
    ORDER BY nspname
  `)) as unknown as NamespaceRow[];
  return rows.map((row) => row.nspname).filter((name) => SCHEMA_NAME_RE.test(name));
}

async function tableAcls(schemaName: string): Promise<AclRow[]> {
  return (await getDb().execute(
    sql.raw(`
SELECT n.nspname AS schema, c.relname, c.relacl::text AS relacl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = ${quoteLiteral(schemaName)}
  AND c.relkind = 'r'
  AND c.relname IN ('documents', 'chunks', 'interaction_events')
ORDER BY c.relname
`),
  )) as unknown as AclRow[];
}

function formatAcls(rows: AclRow[]): string {
  if (rows.length === 0) return "  (no corpus tables)";
  return rows.map((row) => `  ${row.relname}: ${row.relacl ?? "(owner default)"}`).join("\n");
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: { confirm: { type: "boolean", default: false } },
    strict: true,
    allowPositionals: true,
  });
  const confirm = values.confirm === true || positionals.includes("--confirm");

  const schemas = await listFundSchemas();
  console.log(`fund_* schemas: ${schemas.length === 0 ? "(none)" : schemas.join(", ")}`);

  for (const schemaName of schemas) {
    console.log(`BEFORE ${schemaName}\n${formatAcls(await tableAcls(schemaName))}`);
  }

  if (!confirm) {
    console.log("Dry run. Pass --confirm to REVOKE PUBLIC on these schemas.");
    return;
  }

  for (const schemaName of schemas) {
    for (const statement of revokePublicFundSchemaSql(schemaName)) {
      await getDb().execute(sql.raw(statement));
    }
  }

  for (const schemaName of schemas) {
    console.log(`AFTER ${schemaName}\n${formatAcls(await tableAcls(schemaName))}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
