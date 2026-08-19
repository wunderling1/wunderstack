-- Corpus isolation: agent_key on documents (cao | arbo). Backfill visible as its own step.
ALTER TABLE "documents" ADD COLUMN "agent_key" text;--> statement-breakpoint
UPDATE "documents" SET "agent_key" = 'cao' WHERE "agent_key" IS NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "agent_key" SET NOT NULL;--> statement-breakpoint
DROP INDEX "documents_source_uri_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "documents_agent_source_uri_uq" ON "documents" USING btree ("agent_key","source_uri");--> statement-breakpoint
CREATE INDEX "documents_fund_agent_key_idx" ON "documents" USING btree ("fund","agent_key");
