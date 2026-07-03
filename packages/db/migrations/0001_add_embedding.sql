-- Adds the embedding vector column (dim 4096, from EMBEDDING_CONFIG / Fase 3 bake-off).
-- No hnsw/ivfflat index is created on purpose: pgvector ANN indexes support at most 2000
-- dimensions, so retrieval uses exact (flat) search. Revisit if the pinned model changes.
ALTER TABLE "chunks" ALTER COLUMN "embedding_model" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chunks" ALTER COLUMN "embedding_dim" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chunks" ALTER COLUMN "embedding_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "embedding" vector(4096) NOT NULL;