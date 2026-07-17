export * from "./schema.js";
export { getDb, closeDb, type Database } from "./client.js";

// Re-export the query operators consumers need, so the ORM stays behind this seam
// (no package/script imports drizzle-orm directly). Extend as new operators are needed.
export { eq, and, asc, sql } from "drizzle-orm";
// pgvector distance helper used by retrieval (Fase 5). Kept here so the ORM stays behind
// this seam; add l2Distance/innerProduct here too if a later phase needs them.
export { cosineDistance } from "drizzle-orm";
