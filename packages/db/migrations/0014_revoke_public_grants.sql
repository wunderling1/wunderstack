-- Revoke 0013 PUBLIC grants on the control plane. 0013 already ran; editing it does nothing
-- on an existing database. control.users (password_hash) and control.agent_instances never
-- receive a PUBLIC grant. The table owner keeps full rights. A named dashboard/reader login
-- is granted explicitly by scripts/db/grant-reader.ts (DB_READER_ROLE).
REVOKE ALL ON ALL TABLES IN SCHEMA "control" FROM PUBLIC;--> statement-breakpoint
REVOKE USAGE ON SCHEMA "control" FROM PUBLIC;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "control" REVOKE SELECT ON TABLES FROM PUBLIC;--> statement-breakpoint

-- Opaque connection key (never a DSN). Null out any URL that slipped in before the CHECK.
UPDATE "control"."agent_instances" SET "connection_ref" = NULL WHERE "connection_ref" LIKE '%://%';--> statement-breakpoint
ALTER TABLE "control"."agent_instances" RENAME COLUMN "connection_ref" TO "connection_key";--> statement-breakpoint
ALTER TABLE "control"."agent_instances" ADD CONSTRAINT "agent_instances_connection_key_not_url" CHECK ("connection_key" IS NULL OR position('://' in "connection_key") = 0);
