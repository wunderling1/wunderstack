-- Namespace existing document source_uri values by their fund.
--
-- The ingest runner used to key a document on the bare file basename, so the same filename
-- ingested under two funds would collide on the globally-unique source_uri and silently overwrite
-- each other's record. The runner now writes `${fund}/${basename}`; this migration brings existing
-- rows in line so idempotency keeps matching them after the change.
--
-- Only bare basenames are rewritten: a basename never contains a slash, so `source_uri NOT LIKE
-- '%/%'` selects exactly the pre-change rows and skips both already-prefixed rows and scheme-based
-- URIs (e.g. the reserved `eval-fixtures://golden-passages.jsonl`). Re-running is a no-op.
UPDATE "documents"
SET "source_uri" = "fund" || '/' || "source_uri"
WHERE "source_uri" NOT LIKE '%/%';
