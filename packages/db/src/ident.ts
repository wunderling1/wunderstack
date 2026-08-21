/**
 * SQL identifier / literal quoting for DDL that cannot use bind parameters
 * (schema names, SET search_path). Reject anything outside the fund-key alphabet
 * so a caller cannot smuggle SQL through a fund id.
 */

/** Control-plane fund keys: lowercase alphanumeric segments joined by hyphens. */
export const FUND_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Physical schema names (`fund_<key>`), including hyphenated keys. */
export const SCHEMA_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export function assertFundKey(fundKey: string): string {
  if (!FUND_KEY_RE.test(fundKey)) {
    throw new Error(
      `Invalid fund key ${JSON.stringify(fundKey)}. Expected lowercase alphanumeric segments joined by hyphens.`,
    );
  }
  return fundKey;
}

/**
 * Quote a Postgres identifier. Hyphens in `fund_elektronische-detailhandel` require quoting.
 */
export function quoteIdent(ident: string): string {
  if (!SCHEMA_NAME_RE.test(ident)) {
    throw new Error(`Refusing to quote unsafe SQL identifier: ${JSON.stringify(ident)}`);
  }
  return `"${ident.replaceAll('"', '""')}"`;
}

/** Quote a SQL string literal (fund keys, after `assertFundKey`). */
export function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
