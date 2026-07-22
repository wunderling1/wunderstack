/**
 * The single, pinned generation configuration for answer synthesis.
 *
 * Eval and production must share identical sampling parameters so the gate measures what runs
 * in production. Temperature 0 is deliberate for a compliance agent: answers should be
 * deterministic and grounded, not creative.
 *
 * `maxTokens` is 2048: a full CAO answer plus its verbatim citation block (several long quotes)
 * can exceed 1024 tokens and get truncated mid-JSON, which fails the citation contract and strips
 * every source from the served answer. Kept as a plain literal here to avoid a shared → ai
 * dependency cycle; still a bounded cap (denial-of-wallet guard), just a roomier one.
 */

export interface GenerationConfig {
  readonly temperature: number;
  readonly maxTokens: number;
}

export const GENERATION_CONFIG: GenerationConfig = {
  temperature: 0,
  maxTokens: 2048,
};
