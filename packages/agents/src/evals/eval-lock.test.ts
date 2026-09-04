import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  EvalAlreadyRunningError,
  acquireEvalLock,
  isProcessAlive,
} from "./eval-lock";

describe("eval-lock", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wunderstack-eval-lock-"));
  const locks: string[] = [];

  afterEach(() => {
    for (const lockPath of locks.splice(0)) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // ignore
      }
    }
  });

  function tempLockPath(name: string): string {
    const lockPath = path.join(tempDir, `${name}.lock`);
    locks.push(lockPath);
    return lockPath;
  }

  it("blocks a second concurrent acquire on the same lock file", () => {
    const lockPath = tempLockPath("concurrent");
    acquireEvalLock(lockPath);

    assert.throws(
      () => acquireEvalLock(lockPath),
      (error: unknown) => {
        assert.ok(error instanceof EvalAlreadyRunningError);
        assert.equal(error.holder.pid, process.pid);
        return true;
      },
    );
  });

  it("reclaims a stale lock when the recorded pid is not running", () => {
    const lockPath = tempLockPath("stale");
    fs.writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: 999_999_999, startedAt: "2020-01-01T00:00:00.000Z" })}\n`,
    );

    assert.equal(isProcessAlive(999_999_999), false);
    acquireEvalLock(lockPath);
    const holder = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { pid: number };
    assert.equal(holder.pid, process.pid);
  });

  it("refuses when another live pid holds the lock", () => {
    const lockPath = tempLockPath("live");
    fs.writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: process.pid, startedAt: "2020-01-01T00:00:00.000Z" })}\n`,
    );

    assert.throws(
      () => acquireEvalLock(lockPath),
      EvalAlreadyRunningError,
    );
  });
});
