-- Read-only analytics role + row-level security for the interaction event-log (Fase 1, D4).
--
-- `analytics_reader` is a NOLOGIN role the dashboard connects *through* (a login user is provisioned
-- out-of-band on the managed instance and granted this role). Keeping the read path on its own role
-- means a dashboard query can never mutate the event log.
--
-- Everything that needs elevated privilege (CREATE ROLE) is guarded so `drizzle-kit migrate` still
-- succeeds on a managed instance where roles are provisioned by an admin. When the role is created by
-- the admin instead, re-running this migration wires up the grants + policy. See
-- docs/decisions/DECISION-analytics-retention.md.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_reader') THEN
    CREATE ROLE analytics_reader NOLOGIN;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping CREATE ROLE analytics_reader (insufficient privilege); provision it out-of-band, then re-run.';
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_reader') THEN
    GRANT USAGE ON SCHEMA public TO analytics_reader;
    GRANT SELECT ON "interaction_events" TO analytics_reader;
  END IF;
END
$$;
--> statement-breakpoint
-- Enable RLS (owner operation). The table owner (the app/writer role) bypasses RLS, so the runtime's
-- inserts/updates are unaffected; only non-owner roles like analytics_reader are constrained.
ALTER TABLE "interaction_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_reader') THEN
    EXECUTE 'DROP POLICY IF EXISTS "interaction_events_reader_select" ON "interaction_events"';
    EXECUTE 'CREATE POLICY "interaction_events_reader_select" ON "interaction_events" FOR SELECT TO analytics_reader USING (true)';
  ELSE
    RAISE NOTICE 'analytics_reader role absent; skipping RLS policy. Apply it after provisioning the role.';
  END IF;
END
$$;
