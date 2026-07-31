/**
 * Readable failure output for the ingest CLIs.
 *
 * Written after the nightly fixture-ingest failed eleven nights in a row (2026-07-21 .. 2026-07-31)
 * with a log nobody could act on: drizzle printed `Failed query: select "content_hash" …`, the CLI
 * handler printed `error.message`, and the actual reason for a postgres.js connection failure lives in
 * `code` / `cause` — never in `message`. The log therefore showed which query could not run and
 * nothing about why.
 *
 * `describeDatabaseTarget` answers the one question that failure raises — "is CI even pointing at the
 * database I think it is?" — WITHOUT naming it. This repo is public, so its workflow logs are
 * world-readable, and GitHub only masks verbatim secret values: a hostname or user extracted from
 * DATABASE_URL would be printed in the clear. So we print a fingerprint you can compare against a
 * local run instead of the host, user or database name.
 */

import { createHash } from "node:crypto";

/** Fields postgres.js, undici and Node put on connection/query errors. All optional, none secret. */
const DETAIL_FIELDS = [
  "code",
  "errno",
  "syscall",
  "severity",
  "detail",
  "hint",
  "routine",
  "constraint_name",
  "table_name",
  "column_name",
] as const;

const MAX_STACK_FRAMES = 6;
const FINGERPRINT_LENGTH = 12;
/** Keep provider + region (e.g. `osc-fr1.scalingo-dbs.com`), drop the labels that identify the instance. */
const HOST_SUFFIX_LABELS = 3;

function detailsOf(error: Error): string {
  const record = error as unknown as Record<string, unknown>;
  const parts = DETAIL_FIELDS.flatMap((field) => {
    const value = record[field];
    if (value === undefined || value === null || value === "") return [];
    return [`${field}=${String(value)}`];
  });
  return parts.join(" ");
}

function stackFrames(error: unknown): string[] {
  if (!(error instanceof Error) || error.stack === undefined) return [];
  return error.stack
    .split("\n")
    .filter((line) => line.trimStart().startsWith("at "))
    .slice(0, MAX_STACK_FRAMES);
}

/**
 * Every layer of a failure on one readable block: name, message, the driver's own fields, and the
 * whole `cause` chain — plus a few stack frames so you can see where it came from. Cycle-safe, because
 * a wrapped error can point back at its own cause.
 */
export function describeFailure(error: unknown): string {
  const lines: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current);
    const prefix = lines.length === 0 ? "" : "caused by: ";

    if (current instanceof Error) {
      const message = current.message === "" ? "(empty message)" : current.message;
      lines.push(`${prefix}${current.name}: ${message}`);
      const details = detailsOf(current);
      if (details !== "") lines.push(`  ${details}`);
      current = current.cause;
    } else {
      lines.push(`${prefix}${typeof current}: ${String(current)}`);
      current = undefined;
    }
  }

  if (lines.length === 0) {
    lines.push("Failed with no error value at all (thrown null/undefined).");
  }
  lines.push(...stackFrames(error));
  return lines.join("\n");
}

export interface DatabaseTarget {
  /** Stable digest of host+port+database+user. Equal fingerprints mean the same target. */
  fingerprint: string;
  port: string;
  /** `sslmode` from the query string, or null when the URL does not set one. */
  sslmode: string | null;
  /** Provider/region tail of the hostname; never the instance-identifying labels. */
  hostSuffix: string;
}

/**
 * A comparable, non-identifying description of what DATABASE_URL points at. Run the same command
 * locally and compare fingerprints: equal means CI and your laptop talk to the same database (so a
 * failure is connectivity or credentials), different means they do not (so the remote one may never
 * have been migrated).
 */
export function describeDatabaseTarget(rawUrl: string | undefined): DatabaseTarget | null {
  if (rawUrl === undefined || rawUrl === "") return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const database = parsed.pathname.replace(/^\//, "");
  const digest = createHash("sha256")
    .update([parsed.hostname, parsed.port, database, parsed.username].join("|"))
    .digest("hex")
    .slice(0, FINGERPRINT_LENGTH);

  const labels = parsed.hostname.split(".");
  return {
    fingerprint: digest,
    port: parsed.port === "" ? "(default)" : parsed.port,
    sslmode: parsed.searchParams.get("sslmode"),
    hostSuffix: labels.slice(-HOST_SUFFIX_LABELS).join("."),
  };
}

/** One log line, safe for a public CI log. */
export function formatDatabaseTarget(target: DatabaseTarget | null): string {
  if (target === null) {
    return "database target: DATABASE_URL is unset or not a valid URL.";
  }
  return (
    `database target: fingerprint ${target.fingerprint} · port ${target.port} · ` +
    `sslmode ${target.sslmode ?? "(unset)"} · host suffix ${target.hostSuffix} ` +
    `(host, user and database name withheld: this repo is public)`
  );
}
