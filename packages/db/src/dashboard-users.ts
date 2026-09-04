import { and, eq } from "drizzle-orm";

import type { Database } from "./client";
import { getDb, getProvisionerDb } from "./client";
import { users, type User } from "./schema/control/users";

export class UserExistsError extends Error {
  readonly email: string;

  constructor(email: string) {
    super(`A dashboard user with email ${JSON.stringify(email)} already exists.`);
    this.name = "UserExistsError";
    this.email = email;
  }
}

/**
 * Insert a fund-scoped dashboard user. Never upserts — existing email → UserExistsError.
 * Caller supplies an already-hashed password; plaintext never enters this package.
 */
export async function createFundUser(
  input: {
    email: string;
    passwordHash: string;
    tenantId: string;
    mustChangePassword?: boolean;
  },
  db: Database = getProvisionerDb(),
): Promise<User> {
  const email = input.email.toLowerCase().trim();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) {
    throw new UserExistsError(email);
  }

  const [row] = await db
    .insert(users)
    .values({
      email,
      passwordHash: input.passwordHash,
      role: "fund",
      tenantId: input.tenantId,
      mustChangePassword: input.mustChangePassword ?? true,
    })
    .returning();
  if (!row) {
    throw new Error(`Failed to insert fund user ${email}`);
  }
  return row;
}

/** Set a new password hash and clear the must-change flag (provisioner connection). */
export async function updateUserPassword(
  input: { email: string; passwordHash: string },
  db: Database = getProvisionerDb(),
): Promise<User> {
  const email = input.email.toLowerCase().trim();
  const [row] = await db
    .update(users)
    .set({
      passwordHash: input.passwordHash,
      mustChangePassword: false,
    })
    .where(eq(users.email, email))
    .returning();
  if (!row) {
    throw new Error(`No dashboard user with email ${JSON.stringify(email)}`);
  }
  return row;
}

export class UserNotFoundError extends Error {
  readonly userId: string;

  constructor(userId: string) {
    super(`No dashboard user ${JSON.stringify(userId)}.`);
    this.name = "UserNotFoundError";
    this.userId = userId;
  }
}

/** Admin password reset: new hash + mustChangePassword=true. Plaintext never enters this package. */
export async function resetFundUserPassword(
  input: { userId: string; tenantId: string; passwordHash: string },
  db: Database = getProvisionerDb(),
): Promise<User> {
  const [row] = await db
    .update(users)
    .set({
      passwordHash: input.passwordHash,
      mustChangePassword: true,
    })
    .where(and(eq(users.id, input.userId), eq(users.tenantId, input.tenantId), eq(users.role, "fund")))
    .returning();
  if (!row) {
    throw new UserNotFoundError(input.userId);
  }
  return row;
}

export async function updateFundUserEmail(
  input: { userId: string; tenantId: string; email: string },
  db: Database = getProvisionerDb(),
): Promise<User> {
  const email = input.email.toLowerCase().trim();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0] && existing[0].id !== input.userId) {
    throw new UserExistsError(email);
  }
  const [row] = await db
    .update(users)
    .set({ email })
    .where(and(eq(users.id, input.userId), eq(users.tenantId, input.tenantId), eq(users.role, "fund")))
    .returning();
  if (!row) {
    throw new UserNotFoundError(input.userId);
  }
  return row;
}

export type FundUserPublic = {
  id: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  createdAt: Date;
};

/** Fund-scoped accounts for the admin detail view. Never returns password_hash. */
export async function listFundUsers(
  tenantId: string,
  db: Database = getDb(),
): Promise<FundUserPublic[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, "fund")))
    .orderBy(users.email);
}
