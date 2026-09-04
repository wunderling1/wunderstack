import { boolean, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { control } from "./schema";

/**
 * Dashboard users (Fase 3). Backs Auth.js Credentials login for `apps/dashboard`.
 *
 * Roles: `admin` (Wunderling, cross-tenant, `tenantId` is null) and `fund` (scoped to exactly one
 * tenant via `tenantId`, the D15 technical key). Passwords are stored as a self-describing
 * `scrypt$<salt>$<hash>` string (node:crypto scrypt — no external hashing dependency).
 *
 * Writers: `create-user` seed script (DATABASE_URL), and `createFundEnvironment` / password-change
 * via the provisioner connection. The dashboard's main connection is read-only (SELECT for login).
 *
 * Never GRANT this table to PUBLIC (`password_hash`). Dashboard-login gets an explicit GRANT via
 * `scripts/db/grant-reader.ts` (`DB_READER_ROLE`). See migration 0014.
 */
export const users = control.table(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    // "admin" (cross-tenant) | "fund" (scoped to tenantId).
    role: text("role").notNull(),
    // Null for admin; the tenant a fund user is scoped to (D15 key).
    tenantId: text("tenant_id"),
    // When true the user must change their password before entering fund/admin areas.
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_uq").on(table.email)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
