/**
 * Reserved fund the golden eval passages are ingested into (scripts/ingest/fixtures.ts) so the
 * nightly Gate B-integration can run the real retrieval pipeline against them. Single source of
 * truth: both the ingest script and the eval harness import this constant instead of duplicating
 * the literal.
 */
export const EVAL_FIXTURE_FUND = "eval-fixtures";
