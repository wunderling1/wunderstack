/**
 * Opaque connection key for a future promotion path (ADR D2: not live).
 *
 * The column may be null. When set it is a key, never a URL / DSN. A DSN is resolved only via
 * {@link resolveConnection} from a closed set of env vars (`WUNDERSTACK_DB_URL_<KEY>`). Unknown or
 * unset key throws — it must not fall back to DATABASE_URL (that would silently serve the shared
 * addon as the "promoted" fund).
 *
 * Never log the resolved URL. The key itself is not a secret; the env value is.
 */

const CONNECTION_KEY_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

/** Env var name for one opaque key. Closed set: this prefix + {@link CONNECTION_KEY_RE} only. */
export function connectionEnvName(key: string): string {
  return `WUNDERSTACK_DB_URL_${key}`;
}

/**
 * Reject a URL/DSN in the control-plane column. `null` / empty = shared addon (the only live path).
 */
export function assertOpaqueConnectionKey(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.includes("://")) {
    throw new Error("connection_key must be an opaque key, never a URL");
  }
  return trimmed;
}

/**
 * Resolve an opaque key to a DSN from env. Throws on unknown/malformed/unset keys.
 * Does not read DATABASE_URL and must not be used as a silent fallback to getDb().
 */
export function resolveConnection(key: string): string {
  const trimmed = key.trim();
  if (!CONNECTION_KEY_RE.test(trimmed)) {
    throw new Error(`Unknown connection key ${JSON.stringify(key)}`);
  }
  const envName = connectionEnvName(trimmed);
  const raw = process.env[envName];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`Unknown or unset connection key ${JSON.stringify(trimmed)}`);
  }
  const url = raw.trim();
  if (!url.includes("://")) {
    throw new Error(`Unknown or unset connection key ${JSON.stringify(trimmed)}`);
  }
  return url;
}
