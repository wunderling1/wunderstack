import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with node:crypto scrypt — sovereign, no external hashing dependency. Stored as a
 * self-describing `scrypt$<salt>$<hash>` string so the scheme can evolve later without a migration.
 */
const KEY_LENGTH = 64;

/** Unambiguous alphabet (no 0/O/1/l) for generated one-time passwords. */
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

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

/**
 * Generate a one-time password shown once after fund creation. ~20 chars from a 57-symbol alphabet
 * ≈ 117 bits of entropy. Never log or persist the plaintext outside the creating request.
 */
export function generatePassword(length = 20): string {
  if (length < 20) {
    throw new Error("Generated passwords must be at least 20 characters.");
  }
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += PASSWORD_ALPHABET[bytes[i]! % PASSWORD_ALPHABET.length]!;
  }
  return out;
}

/** Exported for tests — the alphabet used by generatePassword. */
export const GENERATED_PASSWORD_ALPHABET = PASSWORD_ALPHABET;
