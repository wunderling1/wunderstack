import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Flock-equivalent lock path — one CAO eval at a time, regardless of how it was started. */
export const DEFAULT_EVAL_LOCK_PATH = path.join(os.tmpdir(), "wunderstack-cao-eval.lock");

export interface EvalLockHolder {
  pid: number;
  startedAt: string;
}

export class EvalAlreadyRunningError extends Error {
  constructor(
    readonly lockPath: string,
    readonly holder: EvalLockHolder,
  ) {
    super(
      `CAO eval already running (pid ${String(holder.pid)}, started ${holder.startedAt}). ` +
        `Lock: ${lockPath}. Stop the other run first; stale locks are removed automatically when the pid is gone.`,
    );
    this.name = "EvalAlreadyRunningError";
  }
}

function readHolder(lockPath: string): EvalLockHolder | null {
  try {
    const raw = fs.readFileSync(lockPath, "utf8").trim();
    const parsed = JSON.parse(raw) as Partial<EvalLockHolder>;
    if (typeof parsed.pid === "number" && typeof parsed.startedAt === "string") {
      return { pid: parsed.pid, startedAt: parsed.startedAt };
    }
  } catch {
    // missing or corrupt — treat as no holder
  }
  return null;
}

/** Returns true when the pid still exists (EPERM counts as alive — another user's process). */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

function removeLockIfOwned(lockPath: string, pid: number): void {
  const holder = readHolder(lockPath);
  if (holder?.pid !== pid) {
    return;
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // best effort
  }
}

function tryRemoveStaleLock(lockPath: string): boolean {
  const holder = readHolder(lockPath);
  if (holder !== null && isProcessAlive(holder.pid)) {
    return false;
  }
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return true;
    }
    return false;
  }
}

/**
 * Acquire an exclusive eval lock (O_EXCL create — portable flock on macOS/Linux).
 * Registers release on process exit and common termination signals.
 */
export function acquireEvalLock(lockPath: string = DEFAULT_EVAL_LOCK_PATH): () => void {
  const holder: EvalLockHolder = { pid: process.pid, startedAt: new Date().toISOString() };

  const tryAcquire = (): void => {
    const fd = fs.openSync(lockPath, "wx");
    try {
      fs.writeFileSync(fd, `${JSON.stringify(holder)}\n`);
    } finally {
      fs.closeSync(fd);
    }
  };

  try {
    tryAcquire();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
    if (!tryRemoveStaleLock(lockPath)) {
      const existing = readHolder(lockPath);
      throw new EvalAlreadyRunningError(
        lockPath,
        existing ?? { pid: -1, startedAt: "unknown" },
      );
    }
    try {
      tryAcquire();
    } catch (retryError) {
      if ((retryError as NodeJS.ErrnoException).code === "EEXIST") {
        const existing = readHolder(lockPath);
        throw new EvalAlreadyRunningError(
          lockPath,
          existing ?? { pid: -1, startedAt: "unknown" },
        );
      }
      throw retryError;
    }
  }

  let released = false;
  const release = (): void => {
    if (released) {
      return;
    }
    released = true;
    removeLockIfOwned(lockPath, process.pid);
  };

  process.once("exit", release);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      release();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }

  return release;
}
