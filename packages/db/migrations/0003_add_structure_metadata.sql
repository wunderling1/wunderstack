ALTER TABLE "chunks" ADD COLUMN "chapter" text;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "article" text;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "lid" text;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "chunk_type" text DEFAULT 'text' NOT NULL;