import { text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { control } from "./schema.js";

/**
 * Dashboard users (Fase 3). Backs Auth.js Credentials login for `apps/dashboard`.
 *
 * Roles: `admin` (Wunderling, cross-tenant, `tenantId` is null) and `fund` (scoped to exactly one
 * tenant via `tenantId`, the D15 technical key). Passwords are stored as a self-describing
 * `scrypt$<salt>$<hash>` string (node:crypto scrypt — no external hashing dependency). This table is
 * written only out-of-band by the `create-user` seed script (using the read-write role); the
 * dashboard itself connects read-only and only SELECTs for login.
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_uq").on(table.email)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
