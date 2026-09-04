import { primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { control } from "./schema";

/**
 * Replay store for LTI 1.1 OAuth nonces. A (consumer_key, nonce) pair may be used once. TTL is 90
 * minutes, matching the launch timestamp skew. Cleanup is inline in `control.acquire_lti11_nonce`.
 */
export const lti11Nonces = control.table(
  "lti11_nonces",
  {
    consumerKey: text("consumer_key").notNull(),
    nonce: text("nonce").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.consumerKey, table.nonce] })],
);

export type Lti11Nonce = typeof lti11Nonces.$inferSelect;
export type NewLti11Nonce = typeof lti11Nonces.$inferInsert;
