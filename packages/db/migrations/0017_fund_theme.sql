-- Fund-level white-label theme (S1). Instances keep theme unused until a later drop PR.
-- IF NOT EXISTS: this DB already has the column from a partial apply; fresh DBs still get it.
ALTER TABLE "control"."funds" ADD COLUMN IF NOT EXISTS "theme" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Copy theme from the cao instance when present, else the alphabetically first instance
-- (same row the old embed console wrote via instances[0] after agentKey sort).
UPDATE "control"."funds" AS f
SET "theme" = COALESCE(
  (
    SELECT i."theme"
    FROM "control"."agent_instances" AS i
    WHERE i.tenant_id = f.key AND i.agent_key = 'cao'
    LIMIT 1
  ),
  (
    SELECT i."theme"
    FROM "control"."agent_instances" AS i
    WHERE i.tenant_id = f.key
    ORDER BY i.agent_key ASC
    LIMIT 1
  ),
  '{}'::jsonb
);
