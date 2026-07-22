import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with node:crypto scrypt — sovereign, no external hashing dependency. Stored as a
 * self-describing `scrypt$<salt>$<hash>` string so the scheme can evolve later without a migration.
 */
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const derived = scryptSync(password, salt, KEY_LENGTH);
  const keyBuffer = Buffer.from(key, "hex");
  // Constant-time compare; length check guards timingSafeEqual's equal-length precondition.
  return keyBuffer.length === derived.length && timingSafeEqual(keyBuffer, derived);
}
