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
 *
 * NOTE: the two consumers reach the provider through different SDKs — the eval calls
 * `generateText` from @wunderstack/ai (`stop`), production goes through Mastra's `modelSettings`
 * (`stopSequences`). This object is the shared source of truth; each side maps it once. A key that
 * is not wired on both sides is a silent eval/production divergence.
 */

export interface GenerationConfig {
  readonly temperature: number;
  readonly maxTokens: number;
  /**
   * Provider stop sequences — the deterministic end of a generation.
   *
   * Measured on the 2026-08-23 run: 6 of 38 Gate C cases finished on `length` while their ANSWER
   * was already complete — prose, `<<<CITATIONS>>>` and a valid, closed JSON array. What burned the
   * remaining ~2.000 tokens was a repository-continuation mode: the model emitted `\n\n\n+++++ `
   * followed by an invented file path and then wrote that file (etd-024 produced Python with
   * `from openai import OpenAI`; etd-004 restarted the whole answer seven times).
   *
   * The prompt already forbids text after the JSON and the model obeys it — it finishes the
   * contract and then starts a DIFFERENT document, which prose instructions do not reliably stop.
   * `+++++` is a concatenated-corpus separator: it cannot occur in Dutch CAO prose or in the
   * citation JSON, so it is a safe hard stop. It appeared in 6 of 6 runaway cases, always directly
   * after the closing `]`.
   *
   * Trimming post-hoc is not an alternative: the truncation gate reads the provider's
   * `finishReason`, so generation has to actually stop here.
   */
  readonly stop: readonly string[];
}

export const GENERATION_CONFIG: GenerationConfig = {
  temperature: 0,
  maxTokens: 2048,
  stop: ["+++++"],
};
