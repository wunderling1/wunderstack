ALTER TABLE "documents" ADD COLUMN "content_hash" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_source_uri_uq" ON "documents" USING btree ("source_uri");