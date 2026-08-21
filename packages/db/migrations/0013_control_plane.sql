CREATE SCHEMA IF NOT EXISTS "control";--> statement-breakpoint
ALTER TABLE "users" SET SCHEMA "control";--> statement-breakpoint
ALTER TABLE "agent_config" SET SCHEMA "control";--> statement-breakpoint
ALTER TABLE "eval_cases" SET SCHEMA "control";--> statement-breakpoint
ALTER TABLE "tenant_config" SET SCHEMA "control";--> statement-breakpoint
ALTER TABLE "control"."tenant_config" RENAME TO "agent_instances";--> statement-breakpoint
ALTER INDEX "control"."tenant_config_public_key_uq" RENAME TO "agent_instances_public_key_uq";--> statement-breakpoint
ALTER TABLE "control"."agent_instances" RENAME CONSTRAINT "tenant_config_tenant_id_agent_key_pk" TO "agent_instances_tenant_id_agent_key_pk";--> statement-breakpoint
ALTER TABLE "control"."agent_instances" ADD COLUMN "schema_name" text;--> statement-breakpoint
UPDATE "control"."agent_instances" SET "schema_name" = 'fund_' || "tenant_id";--> statement-breakpoint
ALTER TABLE "control"."agent_instances" ALTER COLUMN "schema_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."agent_instances" ADD COLUMN "connection_ref" text;--> statement-breakpoint
ALTER TABLE "control"."agent_instances" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."agent_instances" ADD COLUMN "pinned_release_tag" text;--> statement-breakpoint
CREATE TABLE "control"."funds" (
	"key" text PRIMARY KEY NOT NULL,
	"schema_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
INSERT INTO "control"."funds" ("key", "schema_name")
SELECT DISTINCT "fund", 'fund_' || "fund" FROM "documents"
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "control"."funds" ("key", "schema_name")
SELECT DISTINCT "tenant_id", 'fund_' || "tenant_id" FROM "control"."agent_instances"
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
GRANT USAGE ON SCHEMA "control" TO PUBLIC;--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA "control" TO PUBLIC;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "control" GRANT SELECT ON TABLES TO PUBLIC;
