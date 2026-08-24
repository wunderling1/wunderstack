import { pgSchema } from "drizzle-orm/pg-core";

/** Shared control plane (dashboard, instances, tuning knobs). See ADR-multitenant-database. */
export const control = pgSchema("control");
