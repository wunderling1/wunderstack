import { quoteIdent } from "./ident.js";

const ROLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertRoleName(role: string): string {
  if (!ROLE_NAME_RE.test(role)) {
    throw new Error(`Invalid Postgres role name: ${JSON.stringify(role)}`);
  }
  return role;
}

/** GRANT SELECT on control.* for the dashboard/reader login. Shared by grant-reader and createFundEnvironment. */
export function grantReaderOnControlSql(role: string): string[] {
  const qRole = quoteIdent(assertRoleName(role));
  return [
    `GRANT USAGE ON SCHEMA "control" TO ${qRole}`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA "control" TO ${qRole}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "control" GRANT SELECT ON TABLES TO ${qRole}`,
  ];
}

/** GRANT SELECT on one fund_* schema for the dashboard/reader login. */
export function grantReaderOnFundSchemaSql(role: string, schemaName: string): string[] {
  const qRole = quoteIdent(assertRoleName(role));
  const qSchema = quoteIdent(schemaName);
  return [
    `GRANT USAGE ON SCHEMA ${qSchema} TO ${qRole}`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA ${qSchema} TO ${qRole}`,
  ];
}

/**
 * Grant the addon-owner / ingest / runtime login rights on a schema created by the provisioner.
 * Without this, CREATE SCHEMA ownership stays on the provisioner and DATABASE_URL cannot write.
 */
export function grantOwnerOnFundSchemaSql(role: string, schemaName: string): string[] {
  const qRole = quoteIdent(assertRoleName(role));
  const qSchema = quoteIdent(schemaName);
  return [
    `GRANT USAGE, CREATE ON SCHEMA ${qSchema} TO ${qRole}`,
    `GRANT ALL ON ALL TABLES IN SCHEMA ${qSchema} TO ${qRole}`,
    `GRANT ALL ON ALL SEQUENCES IN SCHEMA ${qSchema} TO ${qRole}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${qSchema} GRANT ALL ON TABLES TO ${qRole}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${qSchema} GRANT ALL ON SEQUENCES TO ${qRole}`,
  ];
}
