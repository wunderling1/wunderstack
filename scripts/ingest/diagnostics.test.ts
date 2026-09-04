import assert from "node:assert/strict";
import test from "node:test";

import {
  describeDatabaseTarget,
  describeFailure,
  formatDatabaseTarget,
} from "./diagnostics";

void test("describeFailure — surfaces the driver fields that message hides", () => {
  const error = Object.assign(new Error("write CONNECTION_CLOSED"), {
    code: "CONNECTION_CLOSED",
    errno: -54,
    severity: "FATAL",
  });

  const described = describeFailure(error);

  assert.match(described, /Error: write CONNECTION_CLOSED/);
  assert.match(described, /code=CONNECTION_CLOSED/);
  assert.match(described, /errno=-54/);
  assert.match(described, /severity=FATAL/);
});

void test("describeFailure — an empty message is called out instead of printing a blank line", () => {
  // The nightly log showed exactly this shape: a thrown error whose message rendered as nothing.
  const described = describeFailure(new Error(""));

  assert.match(described, /\(empty message\)/);
});

void test("describeFailure — walks the whole cause chain", () => {
  const root = Object.assign(new Error("getaddrinfo ENOTFOUND db.example"), { code: "ENOTFOUND" });
  const middle = new Error("connection attempt failed", { cause: root });
  const outer = new Error("Failed query: select 1", { cause: middle });

  const described = describeFailure(outer);

  assert.match(described, /Error: Failed query: select 1/);
  assert.match(described, /caused by: Error: connection attempt failed/);
  assert.match(described, /caused by: Error: getaddrinfo ENOTFOUND db\.example/);
  assert.match(described, /code=ENOTFOUND/);
});

void test("describeFailure — a cyclic cause chain terminates", () => {
  const first = new Error("first");
  const second = new Error("second", { cause: first });
  (first as { cause?: unknown }).cause = second;

  const described = describeFailure(first);

  assert.match(described, /Error: first/);
  assert.match(described, /caused by: Error: second/);
  assert.equal(described.split("caused by:").length - 1, 1);
});

void test("describeFailure — non-Error throws and thrown null still say something", () => {
  assert.match(describeFailure("boom"), /string: boom/);
  assert.match(describeFailure(null), /no error value at all/);
});

void test("describeDatabaseTarget — same target fingerprints equal, different target does not", () => {
  const base = "postgres://ingest:secret@abc123.postgresql.osc-fr1.scalingo-dbs.com:31234/wunder";
  const samePasswordChanged =
    "postgres://ingest:rotated@abc123.postgresql.osc-fr1.scalingo-dbs.com:31234/wunder";
  const otherDatabase =
    "postgres://ingest:secret@abc123.postgresql.osc-fr1.scalingo-dbs.com:31234/staging";

  const first = describeDatabaseTarget(base);
  const second = describeDatabaseTarget(samePasswordChanged);
  const third = describeDatabaseTarget(otherDatabase);

  assert.ok(first);
  assert.ok(second);
  assert.ok(third);
  // A rotated password is still the same database, so comparing fingerprints stays meaningful.
  assert.equal(first.fingerprint, second.fingerprint);
  assert.notEqual(first.fingerprint, third.fingerprint);
});

void test("describeDatabaseTarget — reads port, sslmode and the provider tail", () => {
  const target = describeDatabaseTarget(
    "postgres://user:pw@abc123.postgresql.osc-fr1.scalingo-dbs.com:31234/wunder?sslmode=require",
  );

  assert.ok(target);
  assert.equal(target.port, "31234");
  assert.equal(target.sslmode, "require");
  assert.equal(target.hostSuffix, "osc-fr1.scalingo-dbs.com");
});

void test("describeDatabaseTarget — missing sslmode and default port are reported as such", () => {
  const target = describeDatabaseTarget("postgres://user:pw@localhost/wunder");

  assert.ok(target);
  assert.equal(target.sslmode, null);
  assert.equal(target.port, "(default)");
});

void test("describeDatabaseTarget — unset or unparseable url yields null", () => {
  assert.equal(describeDatabaseTarget(undefined), null);
  assert.equal(describeDatabaseTarget(""), null);
  assert.equal(describeDatabaseTarget("not a url"), null);
});

void test("formatDatabaseTarget — never leaks host, user, database or password", () => {
  const url = "postgres://ingest:supersecret@abc123.postgresql.osc-fr1.scalingo-dbs.com:31234/wunder";

  const line = formatDatabaseTarget(describeDatabaseTarget(url));

  for (const forbidden of ["supersecret", "ingest", "abc123", "wunder"]) {
    assert.ok(!line.includes(forbidden), `leaked "${forbidden}" in: ${line}`);
  }
  assert.match(line, /fingerprint [0-9a-f]{12}/);
});

void test("formatDatabaseTarget — says so when DATABASE_URL is absent", () => {
  assert.match(formatDatabaseTarget(null), /DATABASE_URL is unset/);
});
