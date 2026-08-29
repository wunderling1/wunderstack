/**
 * Pure helpers for G3-fund gate preconditions — testable without a live eval run.
 */

import type { ReportCheck } from "./report-writer.js";

/** Fail-closed when discovery finds zero fund sets; empty when at least one is registered. */
export function unregisteredFundSetChecks(setCount: number): ReportCheck[] {
  if (setCount > 0) {
    return [];
  }
  return [
    {
      name: "at least one fund set is registered",
      ok: false,
      detail: "no golden-set.<key>.jsonl fixtures with fund-sets/<key>.json profiles were discovered",
    },
  ];
}
