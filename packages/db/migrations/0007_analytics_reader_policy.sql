-- Analytics read path on managed Postgres (Scalingo), where the app role may NOT `CREATE ROLE`.
--
-- 0006 tried to create a bespoke `analytics_reader` role; on Scalingo that is denied ("permission
-- denied to create role"), so the role approach does not fit the platform. Instead we gate the read
-- path with RLS + table GRANTs and let Scalingo provision the read-only *login* user (which it grants
-- SELECT automatically): `scalingo --app <app> --addon postgresql database-users-create --read-only <name>`.
--
-- This migration is owner-runnable (the app role owns interaction_events) and idempotent.
ALTER TABLE "interaction_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "interaction_events_reader_select" ON "interaction_events";
--> statement-breakpoint
-- SELECT-only, open to any role (PUBLIC). Access is then controlled by the table SELECT-grant: a
-- Scalingo read-only user holds SELECT and can read; it holds no write grant AND there is no
-- write policy, so RLS denies its INSERT/UPDATE/DELETE. The table owner (app/writer role, used by
-- the runtime) bypasses RLS entirely and writes normally.
--
-- NOTE — NO per-tenant row filtering. `USING (true)` means any reader sees ALL rows. This is safe
-- ONLY under the v1 invariant "one instance = one tenant = one DB" (D15): a fund's database contains
-- only its own rows, and the dashboard additionally scopes every fund query by tenantId at the app
-- layer (see packages/analytics/src/kpi.ts). Before any instance holds more than one tenant's data,
-- replace this with a per-tenant predicate (e.g. USING (tenant_id = current_setting('app.tenant_id')))
-- so isolation stops depending solely on the application remembering to filter.
CREATE POLICY "interaction_events_reader_select" ON "interaction_events"
  FOR SELECT TO PUBLIC USING (true);
