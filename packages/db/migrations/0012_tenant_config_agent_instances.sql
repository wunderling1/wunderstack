-- tenant_config becomes an agent-instance table: one row per (tenant_id, agent_key).
ALTER TABLE "tenant_config" ADD COLUMN "agent_key" text;--> statement-breakpoint
UPDATE "tenant_config" SET "agent_key" = "agent_id";--> statement-breakpoint
ALTER TABLE "tenant_config" ALTER COLUMN "agent_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_config" DROP CONSTRAINT "tenant_config_pkey";--> statement-breakpoint
ALTER TABLE "tenant_config" ADD CONSTRAINT "tenant_config_tenant_id_agent_key_pk" PRIMARY KEY("tenant_id","agent_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_config_public_key_uq" ON "tenant_config" USING btree ("public_key");--> statement-breakpoint
ALTER TABLE "tenant_config" DROP COLUMN "agent_id";
