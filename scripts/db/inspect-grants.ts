/**
 * Print schema/table ACLs for control + fund_* (psql \dp equivalent).
 * Never logs connection strings. Used by docs/runbooks/DEPLOY-revoke-public-grants.md.
 *
 *   pnpm --filter @wunderstack/db-scripts inspect-grants
 */

import { closeDb, getDb, sql } from "@wunderstack/db";

interface SchemaAclRow {
  nspname: string;
  nspacl: string | null;
}

interface TableAclRow {
  schema: string;
  relname: string;
  relacl: string | null;
  public_grant: boolean;
}

function formatAcl(value: string | null): string {
  return value ?? "(null — owner default, no GRANT recorded)";
}

async function main(): Promise<void> {
  const who = (await getDb().execute(sql`
    SELECT current_user AS usr, current_database() AS db
  `)) as unknown as Array<{ usr: string; db: string }>;
  const session = who[0];
  console.log(`session: user=${session?.usr ?? "?"} db=${session?.db ?? "?"}`);
  console.log("(no connection strings)\n");

  try {
    const applied = (await getDb().execute(sql`
      SELECT id FROM drizzle.__drizzle_migrations ORDER BY created_at
    `)) as unknown as Array<{ id: number }>;
    console.log(`drizzle migrations applied: ${String(applied.length)}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.log(`drizzle migrations: (could not read __drizzle_migrations: ${detail})`);
  }

  const schemas = (await getDb().execute(sql`
    SELECT nspname, nspacl::text AS nspacl
    FROM pg_namespace
    WHERE nspname = 'control' OR nspname ~ '^fund_'
    ORDER BY nspname
  `)) as unknown as SchemaAclRow[];

  console.log("\n=== schema ACLs (\\dn+) ===");
  for (const row of schemas) {
    console.log(`  ${row.nspname}: ${formatAcl(row.nspacl)}`);
  }

  const tables = (await getDb().execute(sql`
    SELECT
      n.nspname AS schema,
      c.relname,
      c.relacl::text AS relacl,
      COALESCE((
        SELECT bool_or(acl.grantee = 0)
        FROM aclexplode(c.relacl) AS acl
      ), false) AS public_grant
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE (n.nspname = 'control' OR n.nspname ~ '^fund_')
      AND c.relkind = 'r'
    ORDER BY n.nspname, c.relname
  `)) as unknown as TableAclRow[];

  console.log("\n=== table ACLs (\\dp) ===");
  let previous = "";
  let publicHits = 0;
  for (const row of tables) {
    if (row.schema !== previous) {
      console.log(`\n${row.schema}`);
      previous = row.schema;
    }
    const flag = row.public_grant ? " PUBLIC" : "";
    if (row.public_grant) publicHits += 1;
    console.log(`  ${row.relname}: ${formatAcl(row.relacl)}${flag}`);
  }

  console.log(
    `\nPUBLIC grants on listed tables: ${String(publicHits)} (expect 0 after grant-reader + 0014 + revoke-public-fund-grants)`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
