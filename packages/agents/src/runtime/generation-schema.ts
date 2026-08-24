/**
 * Sentinel-delimited citation block appended after the answer prose.
 * The model streams Dutch text with `[n]` markers, then emits this block for server parsing.
 */
export const CITATIONS_SENTINEL = "<<<CITATIONS>>>";
