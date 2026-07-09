/**
 * The single, pinned generation configuration for answer synthesis.
 *
 * Eval and production must share identical sampling parameters so the gate measures what runs
 * in production. Temperature 0 is deliberate for a compliance agent: answers should be
 * deterministic and grounded, not creative.
 *
 * `maxTokens` mirrors `@wunderstack/ai`'s `DEFAULT_MAX_OUTPUT_TOKENS` (1024). Kept as a plain
 * literal here to avoid a shared → ai dependency cycle.
 */

export interface GenerationConfig {
  readonly temperature: number;
  readonly maxTokens: number;
}

export const GENERATION_CONFIG: GenerationConfig = {
  temperature: 0,
  maxTokens: 1024,
};
